import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { messageCreateSchema } from "@/lib/validation";
import { notify } from "@/lib/community";
import { audit } from "@/lib/audit";

const PARTNER = {
  select: { id: true, profile: { select: { displayName: true } } },
} as const;

/** 会话视图：只返回对方昵称与消息摘要，绝不返回邮箱等个人信息。 */
function messageView(m: {
  id: string; senderId: string; recipientId: string; content: string;
  readAt: Date | null; createdAt: Date;
  sender?: { profile: { displayName: string } | null } | null;
  recipient?: { profile: { displayName: string } | null } | null;
}, viewerId: string) {
  return {
    id: m.id,
    senderId: m.senderId,
    recipientId: m.recipientId,
    senderName: m.sender?.profile?.displayName ?? "用户",
    recipientName: m.recipient?.profile?.displayName ?? "用户",
    content: m.content,
    readAt: m.readAt,
    createdAt: m.createdAt,
    outgoing: m.senderId === viewerId,
  };
}

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const { page, pageSize, params } = getQuery(req);
  const withUser = params.get("with");
  const conversations = params.get("conversations") === "1";

  if (conversations) {
    // 拉取当前用户参与的消息（按时间倒序），在应用层聚合为会话列表
    const rows = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, deletedBySender: false },
          { recipientId: user.id, deletedByRecipient: false },
        ],
      },
      orderBy: { createdAt: "desc" }, take: 500,
      include: { sender: PARTNER, recipient: PARTNER },
    });
    const map = new Map<string, { partnerId: string; partnerName: string; last: ReturnType<typeof messageView>; unread: number }>();
    for (const m of rows) {
      const partnerId = m.senderId === user.id ? m.recipientId : m.senderId;
      const partnerName = m.senderId === user.id
        ? m.recipient?.profile?.displayName ?? "用户"
        : m.sender?.profile?.displayName ?? "用户";
      const cur = map.get(partnerId);
      if (!cur) {
        map.set(partnerId, {
          partnerId, partnerName,
          last: messageView(m, user.id),
          unread: m.recipientId === user.id && !m.readAt ? 1 : 0,
        });
      } else if (m.recipientId === user.id && !m.readAt) cur.unread++;
    }
    return ok({ items: Array.from(map.values()), total: map.size });
  }

  if (withUser) {
    const where = {
      OR: [
        { senderId: user.id, recipientId: withUser, deletedBySender: false },
        { senderId: withUser, recipientId: user.id, deletedByRecipient: false },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where, orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { sender: PARTNER, recipient: PARTNER },
      }),
      prisma.message.count({ where }),
    ]);
    // 打开会话时把对方发来的未读消息标记为已读
    await prisma.message.updateMany({
      where: { senderId: withUser, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(paginate(rows.map((m) => messageView(m, user.id)), total, page, pageSize));
  }

  const where = { recipientId: user.id, deletedByRecipient: false };
  const [rows, total, unread] = await Promise.all([
    prisma.message.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      include: { sender: PARTNER, recipient: PARTNER },
    }),
    prisma.message.count({ where }),
    prisma.message.count({ where: { ...where, readAt: null } }),
  ]);
  return ok({ ...paginate(rows.map((m) => messageView(m, user.id)), total, page, pageSize), unread });
});

/** 发送私信：收件人必须存在且账号正常；不允许给自己发；通知对方（不含正文）。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await assertRateLimit(`message.send:${user.id}`, 30, 60);
  const data = await parseBody(messageCreateSchema, req);
  if (data.recipientId === user.id) throw new ApiError(400, "不能给自己发送私信", "SELF_MESSAGE");
  const recipient = await prisma.user.findFirst({
    where: { id: data.recipientId, status: "ACTIVE", deletedAt: null }, select: { id: true },
  });
  if (!recipient) throw new ApiError(404, "收件人不存在或账号不可用", "RECIPIENT_NOT_FOUND");
  const message = await prisma.message.create({
    data: { senderId: user.id, recipientId: data.recipientId, content: data.content },
    include: { sender: PARTNER, recipient: PARTNER },
  });
  await notify(data.recipientId, "message.received", { messageId: message.id, from: user.displayName });
  await audit(req, user.id, "message.send", "message", message.id, { after: { recipientId: data.recipientId } });
  return ok(messageView(message, user.id), 201);
});

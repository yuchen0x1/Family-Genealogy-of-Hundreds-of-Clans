import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

/** 读取单条私信并标记已读；仅收发双方可见。 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const m = await prisma.message.findFirst({
    where: {
      id,
      OR: [{ senderId: user.id, deletedBySender: false }, { recipientId: user.id, deletedByRecipient: false }],
    },
    include: {
      sender: { select: { profile: { select: { displayName: true } } } },
      recipient: { select: { profile: { select: { displayName: true } } } },
    },
  });
  if (!m) throw new ApiError(404, "私信不存在", "NOT_FOUND");
  if (m.recipientId === user.id && !m.readAt) {
    await prisma.message.update({ where: { id }, data: { readAt: new Date() } });
  }
  return ok({
    id: m.id, senderId: m.senderId, recipientId: m.recipientId,
    senderName: m.sender.profile?.displayName ?? "用户",
    recipientName: m.recipient.profile?.displayName ?? "用户",
    content: m.content, readAt: m.readAt, createdAt: m.createdAt,
  });
});

/** 删除只影响自己一侧的视图；双方都删除后物理清理，避免无限堆积。 */
export const DELETE = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const m = await prisma.message.findUnique({ where: { id } });
  if (!m) throw new ApiError(404, "私信不存在", "NOT_FOUND");
  if (m.senderId !== user.id && m.recipientId !== user.id) throw new ApiError(403, "无权操作该私信", "FORBIDDEN");
  const isSender = m.senderId === user.id;
  const nextSenderDeleted = isSender ? true : m.deletedBySender;
  const nextRecipientDeleted = isSender ? m.deletedByRecipient : true;
  if (nextSenderDeleted && nextRecipientDeleted) {
    await prisma.message.delete({ where: { id } });
  } else {
    await prisma.message.update({
      where: { id },
      data: isSender ? { deletedBySender: true } : { deletedByRecipient: true },
    });
  }
  await audit(req, user.id, "message.delete", "message", id);
  return ok({ deleted: true });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { requireUser, destroySession } from "@/lib/auth";
import { verifyPassword, hashPassword, randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const schema = z.object({
  password: z.string().min(1).max(128),
  confirm: z.literal("DELETE_MY_ACCOUNT", { errorMap: () => ({ message: "需输入 DELETE_MY_ACCOUNT 显式确认" }) }),
});

/**
 * 账号注销与个人信息删除。
 *
 * 处理策略（可审计、不误伤他人数据）：
 * - 账号软删除 + 状态 DEACTIVATED + 邮箱脱敏 + 密码哈希替换为不可登录随机值；
 * - 资料脱敏、隐私授权全部撤回、会话全部撤销；
 * - 本人公开帖子转 PRIVATE 并下架；评论内容清空并标记移除；
 * - 本人私信与通知、搜索记录物理删除；
 * - 仅本人参与且无其他协作者的私有族谱一并软删除；有协作者的族谱保留，避免删除他人共同资料。
 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const data = await parseBody(schema, req);
  await assertRateLimit(`pw.verify:${user.id}`, 10, 900);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, email: true } });
  if (!account || !verifyPassword(data.password, account.passwordHash)) {
    throw new ApiError(403, "密码不正确，无法注销", "PASSWORD_MISMATCH");
  }

  const ownedPrivate = await prisma.family.findMany({
    where: { ownerId: user.id, visibility: "PRIVATE", deletedAt: null },
    select: { id: true, _count: { select: { collaborators: { where: { status: "ACTIVE", userId: { not: user.id } } } } } },
  });
  const soloFamilyIds = ownedPrivate.filter((f) => f._count.collaborators === 0).map((f) => f.id);

  const summary = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `deleted-${user.id}@invalid.local`,
        passwordHash: hashPassword(randomToken(24)),
        status: "DEACTIVATED",
        deletedAt: now,
      },
    });
    const profile = await tx.userProfile.updateMany({
      where: { userId: user.id },
      data: {
        displayName: "已注销用户", bio: null, surname: null, location: null, avatarFileId: null,
        privacySettings: { allowClanSearch: false, showSurname: false, showLocation: false, showEmail: false, showRealName: false },
      },
    });
    const sessions = await tx.userSession.updateMany({
      where: { userId: user.id, revokedAt: null }, data: { revokedAt: now },
    });
    const posts = await tx.post.updateMany({
      where: { authorId: user.id, deletedAt: null },
      data: { visibility: "PRIVATE", status: "REMOVED", deletedAt: now },
    });
    const comments = await tx.comment.updateMany({
      where: { authorId: user.id, deletedAt: null },
      data: { content: "[账号已注销，内容已移除]", status: "REMOVED", deletedAt: now },
    });
    const messages = await tx.message.deleteMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    });
    const notifications = await tx.notification.deleteMany({ where: { userId: user.id } });
    const searchRecords = await tx.searchRecord.deleteMany({ where: { userId: user.id } });
    const families = soloFamilyIds.length
      ? await tx.family.updateMany({ where: { id: { in: soloFamilyIds } }, data: { deletedAt: now } })
      : { count: 0 };
    return {
      profile: profile.count, sessions: sessions.count, posts: posts.count, comments: comments.count,
      messages: messages.count, notifications: notifications.count,
      searchRecords: searchRecords.count, families: families.count,
    };
  }, { timeout: 30_000 });

  await audit(req, user.id, "me.account.delete", "user", user.id, {
    after: { ...summary, emailAnonymized: true },
  });
  await destroySession();
  return ok({
    deleted: true, summary,
    notice: "账号与个人信息已按隐私策略处理。涉及其他协作者的族谱资料予以保留，以免删除他人共同录入的内容；平台不再展示您的个人身份信息。",
  });
});

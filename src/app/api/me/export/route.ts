import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * 个人信息导出（可携带权）。
 * 只导出本人产生或本人账号的数据；不导出密码哈希、会话摘要、他人私有资料与族谱人物明细。
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const [account, profile, families, collaborations, posts, comments, notifications, reports, auditLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, status: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.userProfile.findUnique({ where: { userId: user.id } }),
    prisma.family.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true, name: true, surnameText: true, visibility: true, createdAt: true },
    }),
    prisma.familyCollaborator.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { familyId: true, permission: true, status: true, createdAt: true },
    }),
    prisma.post.findMany({
      where: { authorId: user.id }, take: 10000,
      select: { id: true, title: true, content: true, type: true, visibility: true, status: true, tags: true, clues: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: { authorId: user.id }, take: 20000,
      select: { id: true, postId: true, parentId: true, content: true, status: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId: user.id }, take: 10000,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    }),
    prisma.report.findMany({
      where: { reporterId: user.id }, take: 5000,
      select: { id: true, targetType: true, targetId: true, reason: true, status: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { actorId: user.id }, orderBy: { createdAt: "desc" }, take: 500,
      select: { action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);

  const bundle = {
    format: "zhonghua-xungen.personal-data",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notice: "本文件仅包含与您本人账号相关的数据。族谱人物明细、他人私信内容及加密敏感字段不在导出范围内。",
    account,
    profile: profile ? {
      displayName: profile.displayName, bio: profile.bio, surname: profile.surname,
      location: profile.location, privacySettings: profile.privacySettings,
    } : null,
    families, collaborations, posts, comments, notifications, reports, auditLogs,
  };
  const body = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");
  await audit(req, user.id, "me.data.export", "user", user.id, { after: { bytes: body.byteLength } });
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="xungen-personal-data-${user.id.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

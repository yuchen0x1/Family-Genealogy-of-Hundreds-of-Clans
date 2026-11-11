import { NextRequest } from "next/server";
import { z } from "zod";
import { FamilyPermissionCode, CollaboratorStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { randomToken, hashToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  permission: z.enum(["ADMIN", "EDITOR", "VIEWER"]).default("VIEWER"),
});

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  // 协作者邮箱属于私人信息：公开族谱的非协作者访客不得读取名单。
  if (!access.level) return ok({ collaborators: [], invitations: [], restricted: true });
  const collaborators = await prisma.familyCollaborator.findMany({
    where: { familyId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
  });
  const invitations = access.level && ["OWNER", "ADMIN"].includes(access.level)
    ? await prisma.familyInvitation.findMany({ where: { familyId: id, acceptedAt: null, revokedAt: null } })
    : [];
  return ok({ collaborators, invitations });
});

/** 邀请协作者：生成一次性邀请 token（仅保存摘要），需被邀请人登录后接受。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "ADMIN");
  await assertRateLimit(`collab.invite:${user!.id}`, 10, 3600);
  const data = await parseBody(inviteSchema, req);
  if (data.email === user!.email) throw new ApiError(400, "不能邀请自己", "INVALID_INVITATION");

  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const target = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    if (target) {
      const exists = await tx.familyCollaborator.findUnique({ where: { familyId_userId: { familyId: id, userId: target.id } } });
      if (exists && exists.status === CollaboratorStatus.ACTIVE) throw new ApiError(409, "该用户已是协作者", "ALREADY_COLLABORATOR");
      await tx.familyCollaborator.upsert({
        where: { familyId_userId: { familyId: id, userId: target.id } },
        update: { permission: data.permission as FamilyPermissionCode, status: CollaboratorStatus.PENDING },
        create: { familyId: id, userId: target.id, permission: data.permission as FamilyPermissionCode, status: CollaboratorStatus.PENDING, invitedBy: user!.id },
      });
    }
    await tx.familyInvitation.create({
      data: { familyId: id, email: data.email, tokenHash: hashToken(token), permission: data.permission as FamilyPermissionCode, invitedById: user!.id, expiresAt },
    });
  });

  await audit(req, user!.id, "collaborator.invite", "family", id, { after: { email: data.email, permission: data.permission } });
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return ok({ invitationUrl: `${base}/invitations/${token}`, expiresAt }, 201);
});

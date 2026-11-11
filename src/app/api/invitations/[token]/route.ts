import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";

type Ctx = { token: string };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { token } = await ctx.params;
  const invitation = await prisma.familyInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { family: { select: { id: true, name: true, surnameText: true, visibility: true } } },
  });
  if (!invitation || invitation.expiresAt < new Date() || invitation.revokedAt || invitation.acceptedAt) {
    throw new ApiError(404, "邀请无效或已过期", "INVITATION_INVALID");
  }
  return ok({
    family: invitation.family,
    email: invitation.email,
    permission: invitation.permission,
    expiresAt: invitation.expiresAt,
  });
});

/** 接受邀请：校验登录用户邮箱与邀请邮箱一致，之后才授予家族权限。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { token } = await ctx.params;
  const user = await requireUser();
  const invitation = await prisma.familyInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation || invitation.expiresAt < new Date() || invitation.revokedAt || invitation.acceptedAt) {
    throw new ApiError(404, "邀请无效或已过期", "INVITATION_INVALID");
  }
  if (invitation.email !== user.email) throw new ApiError(403, "邀请邮箱与当前账号不一致", "EMAIL_MISMATCH");

  await prisma.$transaction(async (tx) => {
    await tx.familyCollaborator.upsert({
      where: { familyId_userId: { familyId: invitation.familyId, userId: user.id } },
      update: { permission: invitation.permission, status: "ACTIVE", acceptedAt: new Date() },
      create: {
        familyId: invitation.familyId, userId: user.id,
        permission: invitation.permission, status: "ACTIVE",
        invitedBy: invitation.invitedById, acceptedAt: new Date(),
      },
    });
    await tx.familyInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await tx.notification.create({
      data: { userId: invitation.invitedById, type: "invitation_accepted", payload: { familyId: invitation.familyId, userId: user.id } },
    });
  });
  await audit(req, user.id, "invitation.accept", "family_invitation", invitation.id);
  return ok({ familyId: invitation.familyId, permission: invitation.permission });
});

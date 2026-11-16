import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { memberUpdateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite, normalizePersonVisibility } from "@/lib/permissions";
import { encryptSensitive, decryptSensitive } from "@/lib/crypto";
import { publicPersonView, createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string; memberId: string };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, memberId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const member = await prisma.familyMember.findFirst({
    where: { id: memberId, familyId: id, deletedAt: null },
    include: {
      outgoingRelations: {
        where: { deletedAt: null },
        include: { toPerson: { select: { id: true, surnameText: true, givenName: true } } },
      },
      incomingRelations: {
        where: { deletedAt: null },
        include: { fromPerson: { select: { id: true, surnameText: true, givenName: true } } },
      },
      documentLinks: { include: { document: { select: { id: true, title: true, category: true } } } },
    },
  });
  if (!member) throw new ApiError(404, "人物不存在", "NOT_FOUND");

  const view = publicPersonView(member, access);
  let sensitive: string | null = null;
  if (access.level && member.sensitiveDataEncrypted) {
    try { sensitive = decryptSensitive(member.sensitiveDataEncrypted); } catch { sensitive = null; }
  }
  return ok({
    ...view,
    // 敏感资料仅家族协作者本人可见
    sensitiveData: sensitive,
    relations: [
      ...member.outgoingRelations.map((r) => ({ id: r.id, direction: "out", person: r.toPerson, type: r.type, subtype: r.subtype, verification: r.verification })),
      ...member.incomingRelations.map((r) => ({ id: r.id, direction: "in", person: r.fromPerson, type: r.type, subtype: r.subtype, verification: r.verification })),
    ],
    documents: member.documentLinks.map((l) => ({ ...l.document, linkType: l.linkType, verification: l.verification })),
  });
});

export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, memberId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyWrite(user, id);
  const data = await parseBody(memberUpdateSchema, req);
  const existing = await prisma.familyMember.findFirst({ where: { id: memberId, familyId: id, deletedAt: null } });
  if (!existing) throw new ApiError(404, "人物不存在", "NOT_FOUND");

  if (data.branchId) {
    const branch = await prisma.familyBranch.findFirst({ where: { id: data.branchId, familyId: id }, select: { id: true } });
    if (!branch) throw new ApiError(400, "分支不属于该家族", "INVALID_BRANCH");
  }
  const { sensitiveData, ...rest } = data;
  const patch: Record<string, unknown> = { ...rest, version: { increment: 1 } };
  if (sensitiveData !== undefined) {
    patch.sensitiveDataEncrypted = sensitiveData ? encryptSensitive(sensitiveData) : null;
  }
  // 使用“下一状态”判定，而不是只看本次 PATCH 是否同时提交 isLiving。
  // 否则对现有在世人物只提交 visibility=PUBLIC 会绕过隐私边界。
  const nextIsLiving = rest.isLiving ?? existing.isLiving;
  const nextVisibility = normalizePersonVisibility(nextIsLiving, rest.visibility ?? existing.visibility);
  if (rest.isLiving !== undefined || rest.visibility !== undefined || nextVisibility !== existing.visibility) {
    patch.visibility = nextVisibility;
  }

  const member = await prisma.familyMember.update({ where: { id: memberId }, data: patch });
  await createVersionSnapshot(id, `编辑人物：${member.surnameText}${member.givenName}`, user!.id);
  await audit(req, user!.id, "member.update", "family_member", memberId, { after: rest });
  return ok(publicPersonView(member, access));
});

/** 软删除（可恢复），同时软删除关联关系，避免悬挂关系。 */
export const DELETE = route<Ctx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { id, memberId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const member = await prisma.familyMember.findFirst({ where: { id: memberId, familyId: id, deletedAt: null } });
  if (!member) throw new ApiError(404, "人物不存在", "NOT_FOUND");
  const now = new Date();
  await prisma.$transaction([
    prisma.familyMember.update({ where: { id: memberId }, data: { deletedAt: now } }),
    prisma.familyRelationship.updateMany({
      where: { familyId: id, deletedAt: null, OR: [{ fromPersonId: memberId }, { toPersonId: memberId }] },
      data: { deletedAt: now },
    }),
  ]);
  await createVersionSnapshot(id, `删除人物：${member.surnameText}${member.givenName}`, user!.id);
  await audit(req, user!.id, "member.delete", "family_member", memberId);
  return ok({ deleted: true, recoverable: true });
});

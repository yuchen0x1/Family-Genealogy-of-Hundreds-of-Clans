import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string; memberId: string };

/** 恢复误删人物及其关系（同一删除批次内被软删除的关系一并恢复）。 */
export const POST = route<Ctx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { id, memberId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const member = await prisma.familyMember.findFirst({ where: { id: memberId, familyId: id, deletedAt: { not: null } } });
  if (!member) throw new ApiError(404, "没有找到已删除的人物", "NOT_FOUND");

  await prisma.$transaction([
    prisma.familyMember.update({ where: { id: memberId }, data: { deletedAt: null } }),
    prisma.familyRelationship.updateMany({
      where: {
        familyId: id,
        deletedAt: member.deletedAt,
        OR: [{ fromPersonId: memberId }, { toPersonId: memberId }],
      },
      data: { deletedAt: null },
    }),
  ]);
  await createVersionSnapshot(id, `恢复人物：${member.surnameText}${member.givenName}`, user!.id);
  await audit(req, user!.id, "member.restore", "family_member", memberId);
  return ok({ restored: true });
});

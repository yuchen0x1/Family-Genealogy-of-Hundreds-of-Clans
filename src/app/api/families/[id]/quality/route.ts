import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, ok, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyReview } from "@/lib/permissions";
import { inspectGenealogy, QUALITY_MEMBER_LIMIT, QUALITY_RELATION_LIMIT } from "@/lib/genealogy-quality";

export const GET = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  await assertFamilyReview(await getCurrentUser(), id);
  // 同一只读快照，避免并发编辑造成暂时的「引用人物不存在」。不读生平或加密字段。
  const [people, relations] = await prisma.$transaction([
    prisma.familyMember.findMany({
      where: { familyId: id, deletedAt: null }, orderBy: { id: "asc" }, take: QUALITY_MEMBER_LIMIT + 1,
      select: { id: true, surnameText: true, givenName: true, birthYear: true, deathYear: true,
        deathDateText: true, isLiving: true, generationNumber: true, generationConfirmed: true },
    }),
    prisma.familyRelationship.findMany({
      where: { familyId: id, deletedAt: null }, orderBy: { id: "asc" }, take: QUALITY_RELATION_LIMIT + 1,
      select: { id: true, fromPersonId: true, toPersonId: true, type: true, subtype: true, verification: true },
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (people.length > QUALITY_MEMBER_LIMIT || relations.length > QUALITY_RELATION_LIMIT)
    throw new ApiError(422, "当前体检支持最多 10,000 人、30,000 条关系。该族谱超过上限，未生成局部结果；请导出后使用离线工具核查。", "QUALITY_LIMIT_EXCEEDED");
  return ok(inspectGenealogy(people, relations), 200, { "Cache-Control": "private, no-store" });
});

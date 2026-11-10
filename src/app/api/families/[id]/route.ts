import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, ApiError, assertSameOrigin } from "@/lib/api";
import { familyUpdateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { cacheInvalidate } from "@/lib/cache";

type Ctx = { id: string };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const family = await prisma.family.findUnique({
    where: { id },
    include: {
      surname: { select: { id: true, name: true, pinyin: true } },
      branches: { where: { deletedAt: null }, select: { id: true, name: true, color: true, parentId: true } },
      generations: { orderBy: { generationNumber: "asc" } },
      generationPoems: { where: { deletedAt: null }, select: { id: true, title: true, characters: true, reviewStatus: true } },
      _count: { select: { members: true, relationships: true, documents: true } },
    },
  });
  if (!family) throw new ApiError(404, "家族不存在", "NOT_FOUND");
  return ok({
    ...family,
    access: { level: access.level, isOwner: access.isOwner },
    // 私有族谱即使对管理员也不在此接口暴露成员明细
  });
});

export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "ADMIN");
  const data = await parseBody(familyUpdateSchema, req);
  const before = await prisma.family.findUnique({ where: { id }, select: { name: true, visibility: true, description: true } });

  const family = await prisma.family.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.surnameText !== undefined ? { surnameText: data.surnameText } : {}),
      ...(data.founderName !== undefined ? { founderName: data.founderName } : {}),
      ...(data.ancestralHome !== undefined ? { ancestralHome: data.ancestralHome } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.hallName !== undefined ? { hallName: data.hallName } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    },
  });
  await audit(req, user!.id, "family.update", "family", id, { before, after: { name: family.name, visibility: family.visibility } });
  await cacheInvalidate(`family:${id}:`);
  return ok(family);
});

/** 软删除，可由 OWNER 恢复；不会物理删除任何家族数据。 */
export const DELETE = route<Ctx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "OWNER");
  await prisma.family.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(req, user!.id, "family.delete", "family", id);
  await cacheInvalidate(`family:${id}:`);
  return ok({ deleted: true, recoverable: true });
});

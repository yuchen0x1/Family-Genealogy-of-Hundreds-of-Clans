import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";

type Ctx = { id: string };

/** 回收站：仅家族写权限成员可查看已软删除的人物，用于误删恢复。 */
export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "VIEWER");
  const { page, pageSize } = getQuery(req);
  const where = { familyId: id, deletedAt: { not: null } };
  const [rows, total] = await Promise.all([
    prisma.familyMember.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, surnameText: true, givenName: true, gender: true,
        isLiving: true, deletedAt: true, createdAt: true,
      },
    }),
    prisma.familyMember.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

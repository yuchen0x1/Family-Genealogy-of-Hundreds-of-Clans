import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, ApiError } from "@/lib/api";
import { cacheGet, cacheSet } from "@/lib/cache";

type Ctx = { name: string };

export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { name } = await ctx.params;
  const decoded = decodeURIComponent(name);
  const cacheKey = `surnames:detail:${decoded}`;
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return ok(cached, 200, { "X-Cache": "HIT" });

  const surname = await prisma.surname.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { name: decoded },
        { variants: { some: { variant: decoded } } },
        { traditional: decoded },
      ],
    },
    include: {
      origins: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { source: { select: { id: true, title: true, author: true, edition: true, credibility: true } } },
      },
      variants: true,
      hallNames: { where: { deletedAt: null } },
      commanderies: { where: { deletedAt: null } },
      figures: { where: { deletedAt: null }, take: 30, orderBy: { birthYear: "asc" } },
      events: { where: { deletedAt: null }, orderBy: { yearValue: "asc" } },
      migrations: {
        where: { deletedAt: null },
        include: { fromPlace: true, toPlace: true, source: { select: { id: true, title: true } } },
      },
    },
  });
  if (!surname) throw new ApiError(404, "姓氏资料尚未收录", "NOT_FOUND");

  const citations = await prisma.sourceCitation.findMany({
    where: { entityType: "surname_origin", entityId: surname.id },
    include: { source: { select: { id: true, title: true, author: true, edition: true } } },
    take: 30,
  });

  const result = { ...surname, citations };
  await cacheSet(cacheKey, result, 120);
  // 浏览量异步递增，不影响响应
  void prisma.surname.update({ where: { id: surname.id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  return ok(result);
});

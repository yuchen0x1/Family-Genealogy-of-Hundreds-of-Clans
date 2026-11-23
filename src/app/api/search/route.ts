import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { SEARCH_CATEGORIES, searchAll, normalizeSearchTerm, type SearchCategory } from "@/lib/search";
import { cacheGet, cacheSet, rateLimit } from "@/lib/cache";
import { clientIpHash } from "@/lib/api";

export const GET = route(async (req: NextRequest) => {
  const { q, params } = getQuery(req);
  const safeQuery = normalizeSearchTerm(q);
  const user = await getCurrentUser();
  const category = params.get("category");
  if (category && !SEARCH_CATEGORIES.includes(category as SearchCategory)) {
    throw new ApiError(400, "搜索分类无效", "INVALID_CATEGORY");
  }
  const categories = category ? [category as SearchCategory] : undefined;
  const requestedLimit = Number(params.get("limit"));
  const limitPerGroup = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(20, Math.floor(requestedLimit))
    : 8;

  const permit = await rateLimit(`search:${clientIpHash(req)}`, 60, 60);
  if (!permit.allowed) return ok({ rateLimited: true, query: safeQuery, total: 0, groups: [] });

  const cacheKey = `search:v1:${user?.id ?? "anon"}:${safeQuery}:${category ?? "all"}:${limitPerGroup}`;
  const cached = await cacheGet<Awaited<ReturnType<typeof searchAll>>>(cacheKey);
  if (cached) return ok(cached, 200, { "Cache-Control": "private, max-age=30", "X-Cache": "HIT" });

  const result = await searchAll(safeQuery, user, { limitPerGroup, categories });
  await cacheSet(cacheKey, result, 30);
  // 仅记录规范化查询词与聚合数量，不记录被权限过滤掉的具体内容，也不持久化可执行的原始标签
  if (safeQuery) {
    await prisma.searchRecord.create({
      data: { userId: user?.id ?? null, query: safeQuery, resultCount: result.total, filters: { category: category ?? null } },
    }).catch(() => undefined);
  }
  return ok(result, 200, { "Cache-Control": "private, max-age=30" });
});

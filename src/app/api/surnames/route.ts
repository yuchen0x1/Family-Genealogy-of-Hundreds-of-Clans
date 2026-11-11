import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate } from "@/lib/api";
import { cacheGet, cacheSet } from "@/lib/cache";

const insensitive = (s: string) => ({ contains: s, mode: Prisma.QueryMode.insensitive });

export const GET = route(async (req: NextRequest) => {
  const { q, page, pageSize, params } = getQuery(req);
  const category = params.get("category");
  const letter = params.get("letter");
  const detail = params.get("detail");
  const sort = params.get("sort") || "rank";

  const where: Prisma.SurnameWhereInput = {
    deletedAt: null,
    ...(category === "COMPOUND" ? { category: "COMPOUND" as const } : {}),
    ...(category === "SINGLE" ? { category: "SINGLE" as const } : {}),
    // 《百家姓》全表 504 姓中，仅 38 姓带已审定的史料出处（surname_origins 关联记录），
    // 其余 466 姓是字典型条目。用关联记录是否存在作为判据，比 credibility / reviewStatus
    // 更贴近「是否含史料出处」的语义，也避免把审核状态当成资料完整度。
    ...(detail === "documented" ? { origins: { some: {} } } : {}),
    ...(detail === "dictionary" ? { origins: { none: {} } } : {}),
    // A-Z 筛选改用 pinyinKeys 中写入的单个 ASCII 首字母。
    // pinyin 字段带声调（安 ān、鄂 è、欧 ōu …），直接 startsWith("a"/"e"/"o") 会漏掉这些姓。
    ...(letter ? { pinyinKeys: { has: letter.toLowerCase() } } : {}),
    ...(q ? {
      OR: [
        { name: insensitive(q) }, { pinyin: insensitive(q) }, { traditional: insensitive(q) },
        { pinyinKeys: { hasSome: [q.toLowerCase()] } },
      ],
    } : {}),
  };
  const orderBy: Prisma.SurnameOrderByWithRelationInput[] =
    sort === "name" ? [{ name: "asc" }] :
    sort === "pinyin" ? [{ pinyin: "asc" }] :
    [{ popularityRank: { sort: "asc", nulls: "last" } }, { name: "asc" }];

  const cacheKey = `surnames:list:${q}:${category}:${letter}:${detail ?? ""}:${sort}:${page}:${pageSize}`;
  const cached = await cacheGet<{ items: unknown[]; total: number }>(cacheKey);
  if (cached) return ok(cached, 200, { "X-Cache": "HIT" });

  const [rows, total] = await Promise.all([
    prisma.surname.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, name: true, pinyin: true, traditional: true, category: true,
        popularityRank: true, originSummary: true, credibility: true, reviewStatus: true, viewCount: true,
      },
    }),
    prisma.surname.count({ where }),
  ]);
  const result = paginate(rows, total, page, pageSize);
  await cacheSet(cacheKey, result, 120);
  return ok(result);
});

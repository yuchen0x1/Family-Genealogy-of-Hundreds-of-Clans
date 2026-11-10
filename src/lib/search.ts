/**
 * 统一搜索服务（初始方案：PostgreSQL + pg_trgm）
 *
 * 权限铁律：
 * - 私有族谱中的人物、文档、关系绝不出现在匿名/无权限用户的搜索结果中；
 * - 公开族谱中的在世人物，除非主动 PUBLIC，否则只展示姓名，不展示出生日期等详情；
 * - 搜索记录只存查询词与聚合数量，不记录被过滤掉的私有内容。
 *
 * 中文处理：
 * - 中文查询切 2-gram 提升召回（pg_trgm 对中文按字符切三元组，短词易漏）；
 * - 拼音：用 pinyin-pro 把中文查询转全拼/首字母，与姓氏库 pinyin_keys 匹配；
 * - 异体字/繁体：通过 surname_variants 与 traditional 字段命中。
 * 升级路径：zhparser（中文分词）→ Meilisearch / OpenSearch，接口保持不变。
 */
import { Prisma } from "@prisma/client";
import { pinyin } from "pinyin-pro";
import { prisma } from "./db";
import { visibleFamilyIds } from "./permissions";
import type { AuthUser } from "./auth";
import { truncate } from "./utils";

export type SearchCategory = "surnames" | "figures" | "places" | "sources" | "families" | "members" | "posts";
export type SearchGroup = {
  key: SearchCategory;
  label: string;
  total: number;
  items: Array<{ id: string; title: string; subtitle?: string; href: string; badge?: string; extra?: string }>;
};

export interface SearchResult {
  query: string;
  total: number;
  groups: SearchGroup[];
  tookMs: number;
  provider: "postgres_pgtrgm";
  notice: string;
}

function pinyinKeys(query: string): string[] {
  if (!/[\u4e00-\u9fa5]/.test(query)) return [query.toLowerCase()];
  const full = pinyin(query, { toneType: "none", type: "array" }).join("").toLowerCase();
  const initials = pinyin(query, { pattern: "first", toneType: "none", type: "array" }).join("").toLowerCase();
  return Array.from(new Set([query.toLowerCase(), full, initials])).filter(Boolean);
}

/** 中文 2-gram 切分，用于长查询的模糊召回 */
function bigrams(query: string): string[] {
  const chars = Array.from(query.replace(/[^\u4e00-\u9fa5]/g, ""));
  if (chars.length < 3) return [];
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return Array.from(new Set(out)).slice(0, 8);
}

const insensitive = (s: string) => ({ contains: s, mode: Prisma.QueryMode.insensitive });

/**
 * 查询词规范化（纵深防御）。
 *
 * 查询词会被写入 search_records，并随搜索结果回显到页面与后台。虽然 JSON 响应有
 * nosniff、前端由 React 文本转义，仍不应把可执行标签原样持久化或返回：一旦将来某个
 * 展示端改用 innerHTML、或日志被导出为 HTML，就会形成存储型 XSS。
 * 这里剥离控制字符与标签形态后再用于匹配与回显；正常中文、拼音、异体字查询不受影响。
 */
export function normalizeSearchTerm(raw: string): string {
  return String(raw ?? "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export async function searchAll(
  rawQuery: string,
  user: AuthUser | null,
  options: { limitPerGroup?: number; categories?: SearchCategory[] } = {},
): Promise<SearchResult> {
  const started = Date.now();
  const query = normalizeSearchTerm(rawQuery);
  const limit = Math.min(20, options.limitPerGroup ?? 8);
  const wanted = new Set(options.categories ?? (["surnames", "figures", "places", "sources", "families", "members", "posts"] as SearchCategory[]));
  const keys = pinyinKeys(query);
  const grams = bigrams(query);
  const groups: SearchGroup[] = [];

  if (!query) {
    return { query, total: 0, groups: [], tookMs: 0, provider: "postgres_pgtrgm", notice: "请输入搜索内容" };
  }

  // ---------- 姓氏 ----------
  if (wanted.has("surnames")) {
    const variantMatches = await prisma.surnameVariant.findMany({
      where: { variant: { contains: query } },
      select: { surnameId: true },
      take: 30,
    });
    const where: Prisma.SurnameWhereInput = {
      deletedAt: null,
      OR: [
        { name: insensitive(query) },
        { pinyin: insensitive(query) },
        { traditional: insensitive(query) },
        { pinyinKeys: { hasSome: keys } },
        { originSummary: insensitive(query) },
        ...(variantMatches.length ? [{ id: { in: variantMatches.map((v) => v.surnameId) } }] : []),
        ...grams.map((g) => ({ name: insensitive(g) })),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.surname.findMany({ where, orderBy: [{ popularityRank: "asc" }, { name: "asc" }], take: limit }),
      prisma.surname.count({ where }),
    ]);
    groups.push({
      key: "surnames", label: "姓氏资料", total,
      items: rows.map((s) => ({
        id: s.id, title: `${s.name}姓`, subtitle: s.pinyin + (s.traditional ? ` · 繁体 ${s.traditional}` : ""),
        href: `/surnames/${encodeURIComponent(s.name)}`, badge: "百家姓", extra: truncate(s.originSummary ?? "", 60),
      })),
    });
  }

  // ---------- 历史人物 ----------
  if (wanted.has("figures")) {
    const where: Prisma.HistoricalFigureWhereInput = {
      deletedAt: null,
      OR: [
        { name: insensitive(query) }, { courtesyName: insensitive(query) },
        { dynasty: insensitive(query) }, { biography: insensitive(query) },
        ...grams.map((g) => ({ name: insensitive(g) })),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.historicalFigure.findMany({ where, take: limit, include: { surname: { select: { name: true } } } }),
      prisma.historicalFigure.count({ where }),
    ]);
    groups.push({
      key: "figures", label: "历史人物", total,
      items: rows.map((f) => ({ id: f.id, title: f.name, subtitle: f.dynasty ?? "年代不详", href: `/surnames/${encodeURIComponent(f.surname?.name ?? "")}`, badge: "历史资料", extra: truncate(f.biography ?? "", 55) })),
    });
  }

  // ---------- 古今地名 ----------
  if (wanted.has("places")) {
    const aliasMatches = await prisma.placeAlias.findMany({ where: { alias: insensitive(query) }, select: { placeId: true }, take: 30 });
    const where: Prisma.HistoricalPlaceWhereInput = {
      deletedAt: null,
      OR: [
        { historicalName: insensitive(query) }, { modernName: insensitive(query) }, { notes: insensitive(query) },
        ...(aliasMatches.length ? [{ id: { in: aliasMatches.map((a) => a.placeId) } }] : []),
        ...grams.map((g) => ({ historicalName: insensitive(g) })),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.historicalPlace.findMany({ where, take: limit }),
      prisma.historicalPlace.count({ where }),
    ]);
    groups.push({
      key: "places", label: "祖籍与地名", total,
      items: rows.map((p) => ({ id: p.id, title: p.historicalName, subtitle: p.modernName ?? "现代地名待补录", href: `/roots?place=${encodeURIComponent(p.historicalName)}`, badge: "历史地名" })),
    });
  }

  // ---------- 古籍来源 ----------
  if (wanted.has("sources")) {
    const where: Prisma.HistoricalSourceWhereInput = {
      deletedAt: null,
      OR: [{ title: insensitive(query) }, { author: insensitive(query) }, { notes: insensitive(query) }],
    };
    const [rows, total] = await Promise.all([
      prisma.historicalSource.findMany({ where, take: limit }),
      prisma.historicalSource.count({ where }),
    ]);
    groups.push({
      key: "sources", label: "古籍与来源", total,
      items: rows.map((s) => ({ id: s.id, title: s.title, subtitle: s.author ?? "作者待补录", href: "/guide#sources", badge: "史料来源", extra: truncate(s.notes ?? "", 60) })),
    });
  }

  // ---------- 家族（权限过滤） ----------
  const myFamilyIds = await visibleFamilyIds(user?.id);
  if (wanted.has("families")) {
    const where: Prisma.FamilyWhereInput = {
      deletedAt: null,
      OR: [
        { visibility: "PUBLIC", name: insensitive(query) },
        { visibility: "PUBLIC", description: insensitive(query) },
        { visibility: "PUBLIC", ancestralHome: insensitive(query) },
        { visibility: "PUBLIC", hallName: insensitive(query) },
        ...(myFamilyIds.length ? [
          { id: { in: myFamilyIds }, name: insensitive(query) },
          { id: { in: myFamilyIds }, description: insensitive(query) },
          { id: { in: myFamilyIds }, ancestralHome: insensitive(query) },
        ] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.family.findMany({ where, take: limit }),
      prisma.family.count({ where }),
    ]);
    groups.push({
      key: "families", label: "家族族谱", total,
      items: rows.map((f) => ({
        id: f.id, title: f.name,
        subtitle: f.hallName ? `堂号 ${f.hallName}` : f.surnameText,
        href: `/families/${f.id}`,
        badge: f.visibility === "PUBLIC" ? (f.isDemo ? "演示族谱" : "公开族谱") : "我的私有族谱",
        extra: truncate(f.ancestralHome ?? "", 50),
      })),
    });
  }

  // ---------- 人物（严格权限过滤，绝不泄露私有在世人物） ----------
  if (wanted.has("members")) {
    const publicFamilies = await prisma.family.findMany({
      where: { visibility: "PUBLIC", deletedAt: null }, select: { id: true },
    });
    const publicIds = publicFamilies.map((f) => f.id);
    const allowedIds = Array.from(new Set([...publicIds, ...myFamilyIds]));
    const where: Prisma.FamilyMemberWhereInput = {
      deletedAt: null,
      familyId: { in: allowedIds.length ? allowedIds : ["00000000-0000-0000-0000-000000000000"] },
      OR: [{ givenName: insensitive(query) }, { courtesyName: insensitive(query) }, { alias: insensitive(query) }],
    };
    if (myFamilyIds.length === 0) {
      // 匿名/无私有家族权限：公开族谱中只显示已主动公开或已故人物
      where.AND = [
        { OR: [{ visibility: "PUBLIC" }, { isLiving: false }] },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.familyMember.findMany({ where, take: limit, select: { id: true, familyId: true, surnameText: true, givenName: true, isLiving: true, visibility: true, generationNumber: true } }),
      prisma.familyMember.count({ where }),
    ]);
    groups.push({
      key: "members", label: "族谱人物", total,
      items: rows.map((m) => ({
        id: m.id, title: `${m.surnameText}${m.givenName}`,
        subtitle: m.generationNumber ? `第 ${m.generationNumber} 世` : "世系待确认",
        href: `/families/${m.familyId}?focus=${m.id}`,
        badge: m.visibility === "PUBLIC" || !m.isLiving ? "人物" : "受限",
      })),
    });
  }

  // ---------- 寻亲 / 社区帖子 ----------
  if (wanted.has("posts")) {
    const where: Prisma.PostWhereInput = {
      deletedAt: null, status: "PUBLISHED",
      OR: [
        { visibility: "PUBLIC", title: insensitive(query) },
        { visibility: "PUBLIC", content: insensitive(query) },
        { visibility: "PUBLIC", tags: { has: query } },
        ...(user ? [{ authorId: user.id, title: insensitive(query) }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.post.findMany({ where, take: limit, select: { id: true, title: true, type: true, content: true } }),
      prisma.post.count({ where }),
    ]);
    groups.push({
      key: "posts", label: "寻亲与社区", total,
      items: rows.map((p) => ({ id: p.id, title: p.title, href: `/community#post-${p.id}`, badge: p.type === "SEEK_RELATIVE" ? "寻亲" : "社区", extra: truncate(p.content, 60) })),
    });
  }

  const total = groups.reduce((sum, g) => sum + g.total, 0);
  return {
    query, total, groups, tookMs: Date.now() - started, provider: "postgres_pgtrgm",
    notice: "搜索结果已按权限过滤；私有族谱中的人物与资料不会出现在无权限访问的结果里。",
  };
}

/** 顶部搜索框的快速联想（只查姓氏、人物、地名，最多 8 条）。 */
export async function suggest(query: string, user: AuthUser | null) {
  const result = await searchAll(query, user, { limitPerGroup: 4, categories: ["surnames", "figures", "places", "families"] });
  return result.groups.flatMap((g) => g.items.map((i) => ({ label: i.title, href: i.href, kind: g.label }))).slice(0, 8);
}

/**
 * 家族统计聚合。
 *
 * 拆成「纯计算」与「查询」两半：
 * - `summarizeMembers` 不碰数据库，输入人物行、输出统计，便于单测；
 * - `loadFamilyStats` 只负责一次批量查询 + 调用纯函数。
 *
 * 隐私约束：统计只输出聚合数字，绝不返回任何人物姓名、联系信息或加密字段。
 * 传进来的行也只 select 聚合必需的字段，从源头避免把敏感数据带进内存。
 */
import { prisma } from "@/lib/db";

/** 统计只需要这些字段；刻意不含 biography / sensitiveDataEncrypted / avatar。 */
export type StatMemberRow = {
  gender: string;
  isLiving: boolean;
  birthYear: number | null;
  deathYear: number | null;
  generationNumber: number | null;
  generationChar: string | null;
  branchId: string | null;
  verification: string;
  /** 人物级可见性：决定非协作者能否看到其生卒年 */
  visibility: string;
  createdAt: Date;
};

export type CountBucket = { key: string; label: string; count: number };

export type GenerationBucket = {
  generationNumber: number;
  count: number;
  /** 该代中已确认字辈用字的人物数，用于判断字辈录入完整度 */
  withGenerationChar: number;
};

export type DecadeBucket = { decade: number; births: number; deaths: number };

export type FamilyStats = {
  totals: {
    members: number;
    living: number;
    deceased: number;
    /** 出生年份可解析的人物数，用于说明年龄统计的样本量 */
    withBirthYear: number;
    /** 有世代号的人物数，用于说明世代统计的覆盖度 */
    withGeneration: number;
    branches: number;
    /** 已标记为 VERIFIED 的人物数（分母为全部人物） */
    confirmed: number;
  };
  gender: CountBucket[];
  /** 世代分布，按世代号升序 */
  generations: GenerationBucket[];
  /** 字辈用字频率，仅统计已录入的字辈用字 */
  generationChars: Array<{ char: string; count: number }>;
  /** 出生 / 去世按十年聚合，用于时间轴柱状图 */
  decades: DecadeBucket[];
  /**
   * 是否包含在世人物的生卒细节。
   *
   * 公开族谱对匿名访客只展示在世人物的姓名与世代，不展示出生日期。
   * 若统计里仍给出「在世成员年龄分布」，等于把被刻意隐藏的信息以聚合形式
   * 还原出来（人数少时几乎能反推出个人），因此非协作者看到的统计里
   * `livingAges` 为空，且 `decades` 只统计已故人物的年份。
   */
  livingDetailsIncluded: boolean;
  /** 出生年份范围 */
  yearRange: { min: number | null; max: number | null };
  /** 分支人数 Top N（含未归属分支的「未分组」） */
  branches: Array<{ id: string | null; name: string; count: number }>;
  /** 资料核实状态分布 */
  verification: CountBucket[];
  /** 年龄分布（仅在世且有出生年份），按十年一档 */
  livingAges: Array<{ range: string; count: number }>;
};

const GENDER_LABELS: Record<string, string> = {
  MALE: "男",
  FEMALE: "女",
  OTHER: "其他",
  UNKNOWN: "未标注",
};

/**
 * 人物资料核实状态。注意这与「史料可信程度」（DOCUMENTED/TRADITION/INFERRED）
 * 是两套不同的枚举：家族人物用 VerificationStatus，史料用 CredibilityLevel。
 * 标签必须与 `src/components/family/shared.tsx` 的 VERIFICATION_LABELS 一致。
 */
const VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: "未核实",
  PENDING: "待审核",
  VERIFIED: "已核实",
  DISPUTED: "存疑",
  REJECTED: "已驳回",
};

/** 分支人数榜单上限，避免超大家族把接口撑大 */
const TOP_BRANCHES = 12;
/** 年龄分档上限，超过的归入「120+」 */
const MAX_AGE_BUCKET = 120;
/** 十年聚合的合理年份边界，过滤明显的脏数据 */
const MIN_YEAR = 1;
const MAX_YEAR = 2200;

function isPlausibleYear(year: number | null | undefined): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

function countBy(rows: StatMemberRow[], pick: (row: StatMemberRow) => string | null, labels: Record<string, string>): CountBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row) ?? "UNKNOWN";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labels[key] ?? key, count }))
    // 数量降序，同数量时按标签稳定排序，避免每次请求顺序抖动
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

function ageRangeLabel(age: number): string {
  if (age >= MAX_AGE_BUCKET) return `${MAX_AGE_BUCKET}+`;
  const start = Math.floor(age / 10) * 10;
  return `${start}-${start + 9}`;
}

/**
 * 纯计算：把人物行聚合成统计。
 * 不访问数据库、不读环境变量，因此可以完整单测。
 *
 * @param options.canSeeLivingDetails
 *   非协作者（如匿名访客浏览公开族谱）对在世非公开人物看不到生卒日期。
 *   传 false 时，统计只使用已故人物与主动公开的在世人物的年份，
 *   `livingAges` 恒为空，避免以聚合形式还原被隐藏的个人信息。
 */
export function summarizeMembers(
  rows: StatMemberRow[],
  branchNames: Map<string, string>,
  currentYear = new Date().getFullYear(),
  options: { canSeeLivingDetails?: boolean } = {},
): FamilyStats {
  const canSeeLivingDetails = options.canSeeLivingDetails ?? true;
  /** 该人物的生卒年是否可以进入统计 */
  const yearsVisible = (row: StatMemberRow): boolean => {
    if (!row.isLiving) return true;
    if (canSeeLivingDetails) return true;
    return row.visibility === "PUBLIC";
  };

  const living = rows.filter((r) => r.isLiving).length;
  const withBirthYear = rows.filter((r) => yearsVisible(r) && isPlausibleYear(r.birthYear)).length;
  const withGeneration = rows.filter((r) => typeof r.generationNumber === "number" && r.generationNumber > 0).length;
  // 「已核实」指资料核实状态为 VERIFIED；UNVERIFIED/PENDING 都不算
  const confirmed = rows.filter((r) => r.verification === "VERIFIED").length;

  // 世代分布
  const generationMap = new Map<number, { count: number; withGenerationChar: number }>();
  for (const row of rows) {
    const n = row.generationNumber;
    if (typeof n !== "number" || n <= 0) continue;
    const bucket = generationMap.get(n) ?? { count: 0, withGenerationChar: 0 };
    bucket.count += 1;
    if (row.generationChar) bucket.withGenerationChar += 1;
    generationMap.set(n, bucket);
  }
  const generations = [...generationMap.entries()]
    .map(([generationNumber, v]) => ({ generationNumber, ...v }))
    .sort((a, b) => a.generationNumber - b.generationNumber);

  // 字辈用字频率：一字一人，忽略多字字段之外的内容
  const charMap = new Map<string, number>();
  for (const row of rows) {
    const chars = (row.generationChar ?? "").trim();
    if (!chars) continue;
    for (const char of [...chars]) {
      charMap.set(char, (charMap.get(char) ?? 0) + 1);
    }
  }
  const generationChars = [...charMap.entries()]
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char, "zh-CN"));

  // 十年聚合：出生与去世分别计数
  const decadeMap = new Map<number, { births: number; deaths: number }>();
  let minYear: number | null = null;
  let maxYear: number | null = null;
  const touchYear = (year: number) => {
    if (minYear === null || year < minYear) minYear = year;
    if (maxYear === null || year > maxYear) maxYear = year;
  };
  for (const row of rows) {
    if (!yearsVisible(row)) continue;
    if (isPlausibleYear(row.birthYear)) {
      const d = decadeOf(row.birthYear);
      const bucket = decadeMap.get(d) ?? { births: 0, deaths: 0 };
      bucket.births += 1;
      decadeMap.set(d, bucket);
      touchYear(row.birthYear);
    }
    if (isPlausibleYear(row.deathYear)) {
      const d = decadeOf(row.deathYear);
      const bucket = decadeMap.get(d) ?? { births: 0, deaths: 0 };
      bucket.deaths += 1;
      decadeMap.set(d, bucket);
      touchYear(row.deathYear);
    }
  }
  const decades = [...decadeMap.entries()]
    .map(([decade, v]) => ({ decade, ...v }))
    .sort((a, b) => a.decade - b.decade);

  // 分支人数
  const branchMap = new Map<string | null, number>();
  for (const row of rows) {
    const key = row.branchId ?? null;
    branchMap.set(key, (branchMap.get(key) ?? 0) + 1);
  }
  const branches = [...branchMap.entries()]
    .map(([id, count]) => ({ id, name: id ? (branchNames.get(id) ?? "已删除分支") : "未分组", count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, TOP_BRANCHES);

  // 在世年龄分布：只对「在世 + 有出生年 + 出生年不晚于今年」计数。
  // 非协作者看不到在世人物的出生日期，因此也不给出年龄分布。
  const ageMap = new Map<string, number>();
  if (canSeeLivingDetails) {
    for (const row of rows) {
      if (!row.isLiving || !isPlausibleYear(row.birthYear)) continue;
      const age = currentYear - row.birthYear;
      if (age < 0) continue;
      const label = ageRangeLabel(age);
      ageMap.set(label, (ageMap.get(label) ?? 0) + 1);
    }
  }
  const livingAges = [...ageMap.entries()]
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => parseInt(a.range, 10) - parseInt(b.range, 10));

  return {
    totals: {
      members: rows.length,
      living,
      deceased: rows.length - living,
      withBirthYear,
      withGeneration,
      branches: [...branchMap.keys()].filter((k): k is string => k !== null).length,
      confirmed,
    },
    gender: countBy(rows, (r) => r.gender, GENDER_LABELS),
    generations,
    generationChars,
    decades,
    yearRange: { min: minYear, max: maxYear },
    branches,
    verification: countBy(rows, (r) => r.verification, VERIFICATION_LABELS),
    livingAges,
    livingDetailsIncluded: canSeeLivingDetails,
  };
}

/**
 * 读取并聚合一个家族的统计。
 *
 * 一次 `findMany` 取回聚合所需字段（不带正文、加密字段、头像），
 * 再取分支名称做映射；不逐人查询，家族规模变大时仍是常数次查询。
 *
 * 调用方必须先完成 `assertFamilyRead` 鉴权——本函数不做权限判断。
 */
export async function loadFamilyStats(
  familyId: string,
  options: { canSeeLivingDetails?: boolean } = {},
): Promise<FamilyStats> {
  const [members, branches] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId, deletedAt: null },
      select: {
        gender: true,
        isLiving: true,
        birthYear: true,
        deathYear: true,
        generationNumber: true,
        generationChar: true,
        branchId: true,
        verification: true,
        visibility: true,
        createdAt: true,
      },
      // 上限保护：单家族统计不因超大族谱拖垮服务；超出时用 totals 说明覆盖样本
      take: 50_000,
    }),
    prisma.familyBranch.findMany({
      where: { familyId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  return summarizeMembers(members as StatMemberRow[], branchNames, undefined, options);
}

/**
 * 家族内重复人物检测。
 *
 * 数据纪律（与导入流程保持一致）：**只提示，绝不自动合并**。
 * 同姓名不构成同一个人——同名同姓在族谱里非常常见，尤其是「字辈相同 +
 * 辈分相同」的兄弟。因此这里输出的是「疑似重复，建议人工核对」，并把
 * 判定依据逐条写清楚，让人能自己判断，而不是给一个无法解释的分数。
 *
 * 判定分三档，从严到宽：
 *   HIGH   姓名 + 出生年 + 去世年 全部一致（或双方都没有年份）
 *   MEDIUM 姓名一致，且出生年一致或缺失；但去世年不同或至少一方缺失
 *   LOW    仅关联线索一致（字号 / 别名 / 同出生年），姓名不同
 *
 * 刻意不做的事：
 *   - 不做拼音/形近字的模糊匹配：中文姓名改一个字就是另一个人，
 *     模糊匹配的假阳性会让人对整份提示失去信任
 *   - 不跨家族比对：私有族谱之间不做任何交叉推断
 */
import { prisma } from "@/lib/db";

export type DuplicateConfidence = "HIGH" | "MEDIUM" | "LOW";

/** 参与比对的字段：只取判断所需，不含生平、联系方式、加密字段。 */
export type DuplicateCandidateRow = {
  id: string;
  surnameText: string;
  givenName: string;
  courtesyName: string | null;
  alias: string | null;
  birthYear: number | null;
  deathYear: number | null;
  generationNumber: number | null;
  gender: string;
  isLiving: boolean;
  branchId: string | null;
};

export type DuplicateMemberRef = {
  id: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  generationNumber: number | null;
  gender: string;
  isLiving: boolean;
};

export type DuplicatePair = {
  /** 稳定的配对键，供前端做 key 与去重（与顺序无关） */
  key: string;
  confidence: DuplicateConfidence;
  /** 判定依据，逐条可读；为空时不输出该配对 */
  reasons: string[];
  members: [DuplicateMemberRef, DuplicateMemberRef];
};

/**
 * 超大同名组。
 *
 * 同一姓名下有 N 人时，两两组合是 N(N-1)/2：500 个同名人物会产生 12.4 万个
 * 配对、约 47MB JSON。这类情况几乎必然意味着「某支系的字辈用字被反复复用」，
 * 逐个列举既没有可读性也没有必要。因此超过阈值时改为**组级提示**：
 * 告诉使用者这一组有多少人、需要人工去列表里核对，而不是返回组合爆炸的结果。
 */
export type OversizedGroup = {
  name: string;
  count: number;
  reason: string;
};

export type DuplicateReport = {
  /** 已扫描的人物数 */
  scanned: number;
  /** 疑似重复配对，按置信度与姓名排序 */
  pairs: DuplicatePair[];
  /** 人数过多、不做两两配对的同名组 */
  oversizedGroups: OversizedGroup[];
  /** 配对是否因达到上限而被截断 */
  truncated: boolean;
  /** 因超出扫描上限而未参与比对的人数；0 表示完整扫描 */
  notScanned: number;
  /** 扫描上限，便于界面如实说明覆盖范围 */
  scanLimit: number;
};

/** 单次扫描的人物上限：超大家族分批处理，避免一次读入过多行 */
export const DUPLICATE_SCAN_LIMIT = 20_000;

/** 单个同名组超过该人数就不再两两配对，改为组级提示 */
export const DUPLICATE_BUCKET_LIMIT = 30;

/** 返回的配对上限，防止超大族谱把响应撑爆 */
export const DUPLICATE_PAIR_LIMIT = 400;

const CONFIDENCE_ORDER: Record<DuplicateConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function toRef(row: DuplicateCandidateRow): DuplicateMemberRef {
  return {
    id: row.id,
    // 姓与名分列存储，展示时按中文习惯拼接
    name: `${row.surnameText}${row.givenName}`,
    birthYear: row.birthYear,
    deathYear: row.deathYear,
    generationNumber: row.generationNumber,
    gender: row.gender,
    isLiving: row.isLiving,
  };
}

/** 判断一对人物是否疑似重复，返回判定依据；空数组表示不构成疑似。 */
function comparePair(a: DuplicateCandidateRow, b: DuplicateCandidateRow): { confidence: DuplicateConfidence; reasons: string[] } | null {
  const sameName = a.surnameText === b.surnameText && a.givenName === b.givenName;
  const reasons: string[] = [];

  if (sameName) {
    reasons.push("姓与名完全相同");
    const birthSame = a.birthYear !== null && a.birthYear === b.birthYear;
    const deathSame = a.deathYear !== null && a.deathYear === b.deathYear;
    const birthBothUnknown = a.birthYear === null && b.birthYear === null;
    const deathBothUnknown = a.deathYear === null && b.deathYear === null;

    if (birthSame) reasons.push(`出生年相同（${a.birthYear}）`);
    if (deathSame) reasons.push(`去世年相同（${a.deathYear}）`);
    if (birthBothUnknown) reasons.push("双方都没有出生年，无法据此排除");

    // 年份明确冲突时仍提示，但降级：可能是两人，也可能一方记错
    const birthConflict = a.birthYear !== null && b.birthYear !== null && a.birthYear !== b.birthYear;
    const deathConflict = a.deathYear !== null && b.deathYear !== null && a.deathYear !== b.deathYear;
    if (birthConflict) reasons.push(`出生年不同（${a.birthYear} / ${b.birthYear}）`);
    if (deathConflict) reasons.push(`去世年不同（${a.deathYear} / ${b.deathYear}）`);

    if (reasons.length === 1) reasons.push("其余可区分字段均缺失");

    let confidence: DuplicateConfidence = "MEDIUM";
    if (!birthConflict && !deathConflict) {
      // 名字相同 + 无年份冲突：出生年都相同、或都缺失且去世年也缺失，才算高置信
      if ((birthSame || birthBothUnknown) && (deathSame || deathBothUnknown)) confidence = "HIGH";
    } else {
      confidence = "LOW";
    }

    // 世代不同是强反证：同辈同名更可能是重复，跨辈同名多为「承袭祖名」
    if (a.generationNumber !== null && b.generationNumber !== null && a.generationNumber !== b.generationNumber) {
      reasons.push(`世代不同（第 ${a.generationNumber} 代 / 第 ${b.generationNumber} 代），可能是承袭祖名而非重复`);
      confidence = "LOW";
    }

    return { confidence, reasons };
  }

  // 姓名不同时，只在「字号或别名完全相同」这种强线索下提示
  const sharedText = (x: string | null, y: string | null, label: string) => {
    const left = (x ?? "").trim();
    const right = (y ?? "").trim();
    if (left && right && left === right) {
      reasons.push(`${label}相同（${left}）`);
      return true;
    }
    return false;
  };
  const sharedCourtesy = sharedText(a.courtesyName, b.courtesyName, "字号");
  const sharedAlias = sharedText(a.alias, b.alias, "别名");

  if (sharedCourtesy || sharedAlias) {
    reasons.unshift("姓名不同，但存在相同的关联线索");
    // 有共享线索但姓名不同 → 最低档，仅在人工核对后判断
    return { confidence: "LOW", reasons };
  }

  return null;
}

/**
 * 纯计算：从人物行中找出疑似重复的配对。
 *
 * 分桶策略（避免 O(n²)）：
 *   - 主要按「姓+名」分桶，桶内两两比较
 *   - 另按「字号」「别名」各建一份索引，只把跨桶的线索配对补上
 * 家族规模上万时，同名桶通常只有个位数，整体接近线性。
 */
export function findDuplicateCandidates(
  rows: DuplicateCandidateRow[],
  options: { skipNameBucketsAbove?: number } = {},
): DuplicatePair[] {
  const skipAbove = options.skipNameBucketsAbove ?? Number.POSITIVE_INFINITY;
  const pairs = new Map<string, DuplicatePair>();

  const addPair = (a: DuplicateCandidateRow, b: DuplicateCandidateRow) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (pairs.has(key)) return;
    const verdict = comparePair(a, b);
    if (!verdict) return;
    pairs.set(key, {
      key,
      confidence: verdict.confidence,
      reasons: verdict.reasons,
      members: [toRef(a), toRef(b)],
    });
  };

  // 1) 同名分桶
  const byName = new Map<string, DuplicateCandidateRow[]>();
  for (const row of rows) {
    const key = `${row.surnameText}\u0000${row.givenName}`;
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }
  for (const bucket of byName.values()) {
    if (bucket.length < 2) continue;
    // 超大同名组由 analyzeDuplicateCandidates 以组级提示呈现，这里跳过两两枚举
    if (bucket.length > skipAbove) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) addPair(bucket[i], bucket[j]);
    }
  }

  // 2) 字号 / 别名索引：仅用于补「姓名不同但线索相同」的配对
  const addBySharedField = (pick: (row: DuplicateCandidateRow) => string | null) => {
    const index = new Map<string, DuplicateCandidateRow[]>();
    for (const row of rows) {
      const value = (pick(row) ?? "").trim();
      if (!value) continue;
      const bucket = index.get(value);
      if (bucket) bucket.push(row);
      else index.set(value, [row]);
    }
    for (const bucket of index.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) addPair(bucket[i], bucket[j]);
      }
    }
  };
  addBySharedField((r) => r.courtesyName);
  addBySharedField((r) => r.alias);

  return [...pairs.values()].sort((a, b) => {
    const byConfidence = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.members[0].name.localeCompare(b.members[0].name, "zh-CN");
  });
}

/**
 * 带边界的检测入口：在纯配对逻辑之上加两道保护。
 *
 * 1. 同名组超过 `bucketLimit` 人时，不再两两枚举，改为一条组级提示。
 *    这类组几乎必然是「字辈用字被大量复用」，逐个列配对既无意义也会组合爆炸。
 * 2. 配对总数超过 `pairLimit` 时截断，并置 `truncated`，让界面如实告知
 *    使用者「还有更多，请缩小范围或直接在人物列表核对」。
 */
export function analyzeDuplicateCandidates(
  rows: DuplicateCandidateRow[],
  options: { bucketLimit?: number; pairLimit?: number } = {},
): { pairs: DuplicatePair[]; oversizedGroups: OversizedGroup[]; truncated: boolean } {
  const bucketLimit = options.bucketLimit ?? DUPLICATE_BUCKET_LIMIT;
  const pairLimit = options.pairLimit ?? DUPLICATE_PAIR_LIMIT;

  // 先按姓名统计，把超大同名组挑出来单独处理
  const byName = new Map<string, DuplicateCandidateRow[]>();
  for (const row of rows) {
    const key = `${row.surnameText}\u0000${row.givenName}`;
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }

  const oversizedGroups: OversizedGroup[] = [];
  const regular: DuplicateCandidateRow[] = [];
  for (const bucket of byName.values()) {
    if (bucket.length > bucketLimit) {
      const first = bucket[0];
      oversizedGroups.push({
        name: `${first.surnameText}${first.givenName}`,
        count: bucket.length,
        reason: `该姓名下有 ${bucket.length} 人，超过 ${bucketLimit} 人的逐对比较上限。常见于字辈用字被反复复用，建议先在人物管理中按世代与生卒年核对。`,
      });
      // 仍然参与字号/别名线索比对，只是不再做同名两两配对
      regular.push(...bucket);
      continue;
    }
    regular.push(...bucket);
  }

  const all = findDuplicateCandidates(regular, { skipNameBucketsAbove: bucketLimit });
  const truncated = all.length > pairLimit;
  const pairs = truncated ? all.slice(0, pairLimit) : all;

  oversizedGroups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  return { pairs, oversizedGroups, truncated };
}

/**
 * 读取并检测一个家族的疑似重复人物。
 *
 * 调用方必须先完成 `assertFamilyRead` 鉴权——本函数不做权限判断。
 * 只 select 判断所需字段：不读生平、不读加密字段、不返回任何联系方式。
 */
export async function loadDuplicateCandidates(familyId: string): Promise<DuplicateReport> {
  const rows = await prisma.familyMember.findMany({
    where: { familyId, deletedAt: null },
    select: {
      id: true,
      surnameText: true,
      givenName: true,
      courtesyName: true,
      alias: true,
      birthYear: true,
      deathYear: true,
      generationNumber: true,
      gender: true,
      isLiving: true,
      branchId: true,
    },
    orderBy: [{ surnameText: "asc" }, { givenName: "asc" }],
    take: DUPLICATE_SCAN_LIMIT + 1,
  });

  const scanTruncated = rows.length > DUPLICATE_SCAN_LIMIT;
  const scanned = scanTruncated ? rows.slice(0, DUPLICATE_SCAN_LIMIT) : rows;
  const analysis = analyzeDuplicateCandidates(scanned);

  return {
    scanned: scanned.length,
    pairs: analysis.pairs,
    oversizedGroups: analysis.oversizedGroups,
    // 两种截断都要如实告知：扫描被截断，或配对数达到上限
    truncated: analysis.truncated,
    notScanned: scanTruncated ? rows.length - DUPLICATE_SCAN_LIMIT : 0,
    scanLimit: DUPLICATE_SCAN_LIMIT,
  };
}

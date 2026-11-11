import { describe, expect, it } from "vitest";
import {
  DUPLICATE_BUCKET_LIMIT,
  DUPLICATE_PAIR_LIMIT,
  analyzeDuplicateCandidates,
  findDuplicateCandidates,
  type DuplicateCandidateRow,
} from "@/lib/duplicate-detection";

let seq = 0;
function row(overrides: Partial<DuplicateCandidateRow> = {}): DuplicateCandidateRow {
  seq += 1;
  return {
    id: `id-${String(seq).padStart(5, "0")}`,
    surnameText: "陈",
    givenName: `名${seq}`,
    courtesyName: null,
    alias: null,
    birthYear: null,
    deathYear: null,
    generationNumber: null,
    gender: "UNKNOWN",
    isLiving: true,
    branchId: null,
    ...overrides,
  };
}

function sameName(n: number, givenName = "守业"): DuplicateCandidateRow[] {
  return Array.from({ length: n }, () => row({ givenName, birthYear: 1900, deathYear: 1970 }));
}

describe("重复检测的规模边界", () => {
  it("超大同名组不再两两枚举，改为组级提示", () => {
    const rows = sameName(DUPLICATE_BUCKET_LIMIT + 5);
    const result = analyzeDuplicateCandidates(rows);
    expect(result.pairs).toEqual([]);
    expect(result.oversizedGroups).toHaveLength(1);
    expect(result.oversizedGroups[0]).toMatchObject({ name: "陈守业", count: DUPLICATE_BUCKET_LIMIT + 5 });
    expect(result.oversizedGroups[0].reason).toContain("超过");
  });

  it("恰好等于阈值时仍逐对比较（边界不含）", () => {
    const rows = sameName(DUPLICATE_BUCKET_LIMIT);
    const result = analyzeDuplicateCandidates(rows);
    expect(result.oversizedGroups).toEqual([]);
    // C(30,2) = 435，超过默认 400 上限 → 应截断
    expect(result.pairs.length).toBe(DUPLICATE_PAIR_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it("配对数超过上限时截断并置 truncated", () => {
    // 20 人同名 → C(20,2) = 190 对，低于上限
    const small = analyzeDuplicateCandidates(sameName(20));
    expect(small.pairs).toHaveLength(190);
    expect(small.truncated).toBe(false);

    // 25 人同名 → C(25,2) = 300 对，仍低于 400
    expect(analyzeDuplicateCandidates(sameName(25)).pairs).toHaveLength(300);

    // 29 人同名 → C(29,2) = 406 对，超过 400
    const big = analyzeDuplicateCandidates(sameName(29));
    expect(big.pairs).toHaveLength(DUPLICATE_PAIR_LIMIT);
    expect(big.truncated).toBe(true);
  });

  it("自定义上限生效，便于按部署规模调整", () => {
    const result = analyzeDuplicateCandidates(sameName(10), { bucketLimit: 5, pairLimit: 3 });
    expect(result.oversizedGroups).toHaveLength(1);
    expect(result.pairs).toEqual([]);
    expect(result.truncated).toBe(false);

    const pairsLimited = analyzeDuplicateCandidates(sameName(4), { bucketLimit: 10, pairLimit: 2 });
    expect(pairsLimited.pairs).toHaveLength(2);
    expect(pairsLimited.truncated).toBe(true);
  });

  it("超大组即使不做同名配对，仍参与字号线索比对", () => {
    const rows = sameName(DUPLICATE_BUCKET_LIMIT + 2);
    // 给其中一个超大同名组成员一个共享字号，与另一个人构成 LOW 配对
    rows[0] = { ...rows[0], courtesyName: "文正" };
    const other = row({ givenName: "别人", courtesyName: "文正" });
    const result = analyzeDuplicateCandidates([...rows, other]);
    expect(result.oversizedGroups).toHaveLength(1);
    const low = result.pairs.find((p) => p.confidence === "LOW");
    expect(low).toBeDefined();
    expect(low?.reasons.some((r) => r.includes("文正"))).toBe(true);
  });

  it("500 个同名人物时响应体积保持在可接受范围", () => {
    const rows = sameName(500);
    const result = analyzeDuplicateCandidates(rows);
    const bytes = Buffer.byteLength(JSON.stringify(result));
    // 修复前：124,750 对 / 47.5MB。修复后只应剩组级提示，远小于 1MB
    expect(result.pairs).toEqual([]);
    expect(result.oversizedGroups).toHaveLength(1);
    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it("多个超大组按人数降序排列", () => {
    const rows = [
      ...sameName(DUPLICATE_BUCKET_LIMIT + 5, "甲名"),
      ...sameName(DUPLICATE_BUCKET_LIMIT + 20, "乙名"),
    ];
    const result = analyzeDuplicateCandidates(rows);
    expect(result.oversizedGroups.map((g) => g.name)).toEqual(["陈乙名", "陈甲名"]);
  });

  it("无超大组时 oversizedGroups 为空数组，界面无需特殊处理", () => {
    const result = analyzeDuplicateCandidates([row({ givenName: "甲" }), row({ givenName: "甲" })]);
    expect(result.oversizedGroups).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.pairs).toHaveLength(1);
  });

  it("纯函数默认不跳过任何分组（保持既有语义）", () => {
    const rows = sameName(DUPLICATE_BUCKET_LIMIT + 3);
    const pairs = findDuplicateCandidates(rows);
    const n = DUPLICATE_BUCKET_LIMIT + 3;
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
  });

  it("显式传入跳过阈值时，纯函数按阈值跳过", () => {
    const rows = sameName(10);
    expect(findDuplicateCandidates(rows, { skipNameBucketsAbove: 5 })).toEqual([]);
    expect(findDuplicateCandidates(rows, { skipNameBucketsAbove: 10 })).toHaveLength(45);
  });

  it("高基数共享别名不再两两枚举，改为组级提示", () => {
    // 40 人都把别名填成「无」：修复前会产生 C(40,2)=780 个配对
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({ givenName: `名${i}`, alias: "无" }),
    );
    const result = analyzeDuplicateCandidates(rows);
    expect(result.pairs).toEqual([]);
    expect(result.oversizedGroups).toHaveLength(1);
    expect(result.oversizedGroups[0]).toMatchObject({
      kind: "alias",
      name: "别名「无」",
      count: 40,
    });
    expect(result.truncated).toBe(false);
  });

  it("高基数共享字号同样被屏蔽，且不参与的只是该字段", () => {
    // 同为字号「文正」的 35 人：字号线索跳过，但他们若同名仍按姓名比较
    const rows = Array.from({ length: 35 }, (_, i) =>
      row({ givenName: i < 2 ? "守业" : `名${i}`, courtesyName: "文正" }),
    );
    const result = analyzeDuplicateCandidates(rows);
    expect(result.oversizedGroups.some((g) => g.kind === "courtesyName" && g.count === 35)).toBe(true);
    // 同名的两人仍被检出（走姓名分桶，不走字号）
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].members.every((m) => m.name === "陈守业")).toBe(true);
  });

  it("低基数共享别名仍正常产生候选", () => {
    const rows = [
      row({ givenName: "甲", alias: "阿三" }),
      row({ givenName: "乙", alias: "阿三" }),
    ];
    const result = analyzeDuplicateCandidates(rows);
    expect(result.oversizedGroups).toEqual([]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].confidence).toBe("LOW");
  });

  it("纯函数支持按值屏蔽特定字号/别名", () => {
    const rows = [
      row({ givenName: "甲", alias: "无" }),
      row({ givenName: "乙", alias: "无" }),
    ];
    expect(findDuplicateCandidates(rows)).toHaveLength(1);
    expect(findDuplicateCandidates(rows, { skipAliasValues: new Set(["无"]) })).toEqual([]);
  });

  it("达到配对上限后立即停止，不再枚举剩余组合", () => {
    // 20 人同名 → 190 对；上限设为 5 时只应收集 5 对
    const rows = sameName(20);
    const result = findDuplicateCandidates(rows, { pairLimit: 5 });
    expect(result).toHaveLength(5);
    // 未设上限时同一批数据是 190 对，证明提前退出而非截断后丢弃
    expect(findDuplicateCandidates(rows)).toHaveLength(190);
  });
});

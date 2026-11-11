/**
 * 《百家姓》全表与检索键的防回归测试。
 *
 * `prisma/seed-data-baijiaxing.ts` 已在模块加载期强制校验 504/444/60/564 字等不变量，
 * 但 vitest 只收 `src/tests/**`，CI 的 quality job 也只跑 `pnpm test`。
 * 本文件把这些不变量「显式断言」成 CI 可见的门禁，并覆盖 seed.ts 的 pinyinKeys 生成逻辑，
 * 防止 A–Z 筛选修复（带声调元音开头姓氏）在后续重构中回归。
 */
import { describe, it, expect } from "vitest";
import { surnames } from "../../prisma/seed-data";
import { buildPinyinKeys } from "@/lib/surname-pinyin";

describe("《百家姓》通行本全表不变量", () => {
  it("收录 504 姓：444 单姓 + 60 复姓", () => {
    expect(surnames).toHaveLength(504);
    const compound = surnames.filter((s) => s.compound === true);
    expect(compound).toHaveLength(60);
    expect(surnames.length - compound.length).toBe(444);
  });

  it("《百家姓》序位恰为 1..504，连续且唯一", () => {
    const ranks = surnames.map((s) => s.rank);
    expect(ranks.every((r) => typeof r === "number")).toBe(true);
    const nums = ranks as number[];
    expect(new Set(nums).size).toBe(504);
    expect([...nums].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 504 }, (_, i) => i + 1),
    );
  });

  it("姓氏字形无重复", () => {
    expect(new Set(surnames.map((s) => s.name)).size).toBe(504);
  });

  it("38 条史料条目 / 466 条字典型条目，字典项不编造源流", () => {
    const documented = surnames.filter((s) => s.origins.length > 0);
    const dictionary = surnames.filter((s) => s.origins.length === 0);
    expect(documented).toHaveLength(38);
    expect(dictionary).toHaveLength(466);
    for (const s of dictionary) {
      expect(s.credibility).toBe("UNVERIFIED");
      expect(s.reviewStatus).toBe("PENDING");
    }
    // 带史料出处的条目不应是 UNVERIFIED，且首次写入应为 APPROVED
    for (const s of documented) {
      expect(s.credibility).not.toBe("UNVERIFIED");
      expect(s.reviewStatus).toBe("APPROVED");
    }
  });

  it("每条都有可检索的姓氏读音", () => {
    for (const s of surnames) expect(s.pinyin.trim().length).toBeGreaterThan(0);
  });
});

describe("姓氏检索键（A–Z 筛选防回归）", () => {
  it("带声调元音开头的姓氏含对应 ASCII 首字母", () => {
    const cases = [
      ["安", "ān", "a"], ["鄂", "è", "e"], ["艾", "ài", "a"],
      ["欧", "ōu", "o"], ["敖", "áo", "a"], ["爱", "ài", "a"],
    ] as const;
    for (const [name, py, letter] of cases) {
      expect(buildPinyinKeys(name, py), `${name} 应含首字母 ${letter}`).toContain(letter);
    }
  });

  it("复姓「欧阳」同样含 ASCII 首字母 o", () => {
    expect(buildPinyinKeys("欧阳", "ōu yáng")).toContain("o");
  });

  it("姓氏专用读音写入无调全拼（查 zhā → zha）", () => {
    expect(buildPinyinKeys("查", "zhā")).toContain("zha");
  });

  it("全表 504 姓每条都含一个单字符 ASCII 首字母键", () => {
    for (const s of surnames) {
      const keys = buildPinyinKeys(s.name, s.pinyin, s.traditional);
      expect(
        keys.some((k) => /^[a-z]$/.test(k)),
        `${s.name} 缺少 ASCII 首字母检索键`,
      ).toBe(true);
    }
  });
});

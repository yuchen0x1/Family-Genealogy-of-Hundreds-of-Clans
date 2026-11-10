import { describe, expect, it } from "vitest";
import { summarizeMembers, type StatMemberRow } from "@/lib/family-stats";

function row(overrides: Partial<StatMemberRow> = {}): StatMemberRow {
  return {
    gender: "UNKNOWN",
    isLiving: true,
    birthYear: null,
    deathYear: null,
    generationNumber: null,
    generationChar: null,
    branchId: null,
    verification: "UNVERIFIED",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("家族统计聚合", () => {
  it("空族谱返回全零且不抛错", () => {
    const stats = summarizeMembers([], new Map(), 2026);
    expect(stats.totals.members).toBe(0);
    expect(stats.totals.living).toBe(0);
    expect(stats.gender).toEqual([]);
    expect(stats.generations).toEqual([]);
    expect(stats.decades).toEqual([]);
    expect(stats.yearRange).toEqual({ min: null, max: null });
    expect(stats.livingAges).toEqual([]);
  });

  it("统计在册/在世/已故人数与性别构成，并按人数降序", () => {
    const stats = summarizeMembers([
      row({ gender: "MALE", isLiving: false }),
      row({ gender: "MALE" }),
      row({ gender: "MALE" }),
      row({ gender: "FEMALE" }),
      row({ gender: "UNKNOWN" }),
    ], new Map(), 2026);
    expect(stats.totals).toMatchObject({ members: 5, living: 4, deceased: 1 });
    expect(stats.gender[0]).toEqual({ key: "MALE", label: "男", count: 3 });
    expect(stats.gender.find((g) => g.key === "UNKNOWN")).toMatchObject({ label: "未标注", count: 1 });
  });

  it("按世代号聚合，并单独统计该代已录字辈人数", () => {
    const stats = summarizeMembers([
      row({ generationNumber: 1, generationChar: "文" }),
      row({ generationNumber: 1 }),
      row({ generationNumber: 3, generationChar: "德" }),
      row({ generationNumber: null }),
      row({ generationNumber: 0 }),
    ], new Map(), 2026);
    expect(stats.generations).toEqual([
      { generationNumber: 1, count: 2, withGenerationChar: 1 },
      { generationNumber: 3, count: 1, withGenerationChar: 1 },
    ]);
    // 世代号 0 / null 不计入，但仍在 total 里
    expect(stats.totals.withGeneration).toBe(3);
    expect(stats.totals.members).toBe(5);
  });

  it("字辈按单字计数，多字字段拆开统计", () => {
    const stats = summarizeMembers([
      row({ generationChar: "文" }),
      row({ generationChar: "文" }),
      row({ generationChar: "武" }),
      row({ generationChar: "文德" }),
      row({ generationChar: "   " }),
    ], new Map(), 2026);
    expect(stats.generationChars[0]).toEqual({ char: "文", count: 3 });
    expect(stats.generationChars).toContainEqual({ char: "德", count: 1 });
    expect(stats.generationChars).toContainEqual({ char: "武", count: 1 });
  });

  it("十年聚合同时统计出生与去世，并给出年份范围", () => {
    const stats = summarizeMembers([
      row({ birthYear: 1901, deathYear: 1975 }),
      row({ birthYear: 1909 }),
      row({ birthYear: 1950 }),
    ], new Map(), 2026);
    expect(stats.decades).toEqual([
      { decade: 1900, births: 2, deaths: 0 },
      { decade: 1950, births: 1, deaths: 0 },
      { decade: 1970, births: 0, deaths: 1 },
    ]);
    expect(stats.yearRange).toEqual({ min: 1901, max: 1975 });
    expect(stats.totals.withBirthYear).toBe(3);
  });

  it("过滤明显异常的年份，不让脏数据污染统计", () => {
    const stats = summarizeMembers([
      row({ birthYear: 0 }),
      row({ birthYear: -50 }),
      row({ birthYear: 9999 }),
      row({ birthYear: 1.5 }),
      row({ birthYear: 1980 }),
    ], new Map(), 2026);
    expect(stats.totals.withBirthYear).toBe(1);
    expect(stats.yearRange).toEqual({ min: 1980, max: 1980 });
  });

  it("分支人数按降序，未归属分支归入「未分组」，未知分支 ID 标为已删除", () => {
    const stats = summarizeMembers([
      row({ branchId: "a" }),
      row({ branchId: "a" }),
      row({ branchId: "b" }),
      row({ branchId: null }),
      row({ branchId: "gone" }),
    ], new Map([["a", "长房"], ["b", "二房"]]), 2026);
    expect(stats.branches[0]).toMatchObject({ name: "长房", count: 2 });
    expect(stats.branches).toContainEqual({ id: null, name: "未分组", count: 1 });
    expect(stats.branches).toContainEqual({ id: "gone", name: "已删除分支", count: 1 });
    // totals.branches 只数真实存在的分支 ID
    expect(stats.totals.branches).toBe(3);
  });

  it("分支榜单有上限，避免超大家族把接口撑大", () => {
    const rows: StatMemberRow[] = [];
    for (let i = 0; i < 40; i += 1) rows.push(row({ branchId: `b${i}` }));
    const names = new Map(rows.map((r, i) => [r.branchId as string, `分支${i}`]));
    const stats = summarizeMembers(rows, names, 2026);
    expect(stats.branches).toHaveLength(12);
  });

  it("在世年龄只统计有出生年且非未来年份的人物", () => {
    const stats = summarizeMembers([
      row({ isLiving: true, birthYear: 1990 }),  // 36
      row({ isLiving: true, birthYear: 1985 }),  // 41
      row({ isLiving: true, birthYear: 2030 }),  // 未来，跳过
      row({ isLiving: false, birthYear: 1900 }), // 已故，跳过
      row({ isLiving: true, birthYear: null }),  // 无年份，跳过
    ], new Map(), 2026);
    expect(stats.livingAges).toEqual([
      { range: "30-39", count: 1 },
      { range: "40-49", count: 1 },
    ]);
  });

  it("超高年龄归入 120+ 档而不是无限分档", () => {
    const stats = summarizeMembers([row({ isLiving: true, birthYear: 1800 })], new Map(), 2026);
    expect(stats.livingAges).toEqual([{ range: "120+", count: 1 }]);
  });

  it("核实状态分布使用中文标签，并统计已核实人数", () => {
    const stats = summarizeMembers([
      row({ verification: "VERIFIED" }),
      row({ verification: "VERIFIED" }),
      row({ verification: "PENDING" }),
      row({ verification: "UNVERIFIED" }),
      row({ verification: "DISPUTED" }),
    ], new Map(), 2026);
    expect(stats.totals.confirmed).toBe(2);
    expect(stats.verification[0]).toEqual({ key: "VERIFIED", label: "已核实", count: 2 });
    expect(stats.verification.find((v) => v.key === "DISPUTED")).toMatchObject({ label: "存疑", count: 1 });
    // 标签表必须覆盖 FamilyMember.verification 的全部枚举值，不能把英文枚举直接吐给用户
    for (const v of stats.verification) {
      expect(v.label).not.toBe(v.key);
    }
  });

  it("PENDING 与 UNVERIFIED 都不计入已核实", () => {
    const stats = summarizeMembers([
      row({ verification: "PENDING" }),
      row({ verification: "UNVERIFIED" }),
    ], new Map(), 2026);
    expect(stats.totals.confirmed).toBe(0);
  });

  it("输出中不含任何人物姓名字段，避免统计接口变成隐私旁路", () => {
    const stats = summarizeMembers([row({ gender: "FEMALE" })], new Map(), 2026);
    const serialized = JSON.stringify(stats);
    for (const forbidden of ["givenName", "surnameText", "biography", "sensitiveData", "birthDateText"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

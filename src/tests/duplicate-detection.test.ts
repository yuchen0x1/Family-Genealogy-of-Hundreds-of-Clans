import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, type DuplicateCandidateRow } from "@/lib/duplicate-detection";

let seq = 0;
function row(overrides: Partial<DuplicateCandidateRow> = {}): DuplicateCandidateRow {
  seq += 1;
  return {
    id: `id-${String(seq).padStart(4, "0")}`,
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

describe("重复人物检测", () => {
  it("姓名与生卒年全一致时判为 HIGH，并列出全部依据", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业", birthYear: 1900, deathYear: 1970 }),
      row({ givenName: "守业", birthYear: 1900, deathYear: 1970 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe("HIGH");
    expect(pairs[0].reasons).toEqual([
      "姓与名完全相同",
      "出生年相同（1900）",
      "去世年相同（1970）",
    ]);
    expect(pairs[0].members.map((m) => m.name)).toEqual(["陈守业", "陈守业"]);
  });

  it("姓名相同但双方年份全缺失时仍判 HIGH，并说明无法据此排除", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业" }),
      row({ givenName: "守业" }),
    ]);
    expect(pairs[0].confidence).toBe("HIGH");
    expect(pairs[0].reasons).toContain("双方都没有出生年，无法据此排除");
  });

  it("姓名相同但出生年冲突时降为 LOW，并写明冲突值", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业", birthYear: 1900 }),
      row({ givenName: "守业", birthYear: 1950 }),
    ]);
    expect(pairs[0].confidence).toBe("LOW");
    expect(pairs[0].reasons).toContain("出生年不同（1900 / 1950）");
  });

  it("姓名相同但世代不同时降为 LOW，并提示可能是承袭祖名", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "文德", generationNumber: 5, birthYear: 1800 }),
      row({ givenName: "文德", generationNumber: 9, birthYear: 1800 }),
    ]);
    expect(pairs[0].confidence).toBe("LOW");
    expect(pairs[0].reasons.some((r) => r.includes("承袭祖名"))).toBe(true);
  });

  it("姓名相同、只有一方有出生年时判为 MEDIUM", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业", birthYear: 1900 }),
      row({ givenName: "守业" }),
    ]);
    expect(pairs[0].confidence).toBe("MEDIUM");
  });

  it("姓不同但名字相同时不视为重复（改姓即另一个人）", () => {
    const pairs = findDuplicateCandidates([
      row({ surnameText: "陈", givenName: "守业" }),
      row({ surnameText: "林", givenName: "守业" }),
    ]);
    expect(pairs).toEqual([]);
  });

  it("姓名不同但字号相同时给出 LOW 提示", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "甲", courtesyName: "文正" }),
      row({ givenName: "乙", courtesyName: "文正" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe("LOW");
    expect(pairs[0].reasons[0]).toContain("姓名不同");
    expect(pairs[0].reasons.some((r) => r.includes("字号相同（文正）"))).toBe(true);
  });

  it("姓名不同但别名相同时给出 LOW 提示", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "甲", alias: "阿三" }),
      row({ givenName: "乙", alias: "阿三" }),
    ]);
    expect(pairs[0].confidence).toBe("LOW");
    expect(pairs[0].reasons.some((r) => r.includes("别名相同（阿三）"))).toBe(true);
  });

  it("空字号与空别名不会被误认为相同线索", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "甲", courtesyName: null, alias: "" }),
      row({ givenName: "乙", courtesyName: "", alias: null }),
    ]);
    expect(pairs).toEqual([]);
  });

  it("三人同名时产生 3 个配对，而不是只配一对", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业" }),
      row({ givenName: "守业" }),
      row({ givenName: "守业" }),
    ]);
    expect(pairs).toHaveLength(3);
  });

  it("同一对人物不会因多个线索被重复计入", () => {
    const a = row({ givenName: "甲", courtesyName: "文正", alias: "阿三" });
    const b = row({ givenName: "甲", courtesyName: "文正", alias: "阿三" });
    const pairs = findDuplicateCandidates([a, b]);
    expect(pairs).toHaveLength(1);
    // 已被同名分桶收录，不再生成第二条
    expect(pairs[0].key).toBe([a.id, b.id].sort().join("|"));
  });

  it("结果按置信度排序：HIGH 在 MEDIUM 之前，MEDIUM 在 LOW 之前", () => {
    const pairs = findDuplicateCandidates([
      // MEDIUM：同名，只有一方有出生年
      row({ givenName: "乙名", birthYear: 1900 }),
      row({ givenName: "乙名" }),
      // HIGH：同名同生卒
      row({ givenName: "甲名", birthYear: 1800, deathYear: 1850 }),
      row({ givenName: "甲名", birthYear: 1800, deathYear: 1850 }),
      // LOW：字号相同但姓名不同
      row({ givenName: "丙名", courtesyName: "同号" }),
      row({ givenName: "丁名", courtesyName: "同号" }),
    ]);
    expect(pairs.map((p) => p.confidence)).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("空输入返回空结果", () => {
    expect(findDuplicateCandidates([])).toEqual([]);
  });

  it("完全没有重复时返回空数组", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "甲", birthYear: 1900 }),
      row({ givenName: "乙", birthYear: 1910 }),
      row({ givenName: "丙", birthYear: 1920 }),
    ]);
    expect(pairs).toEqual([]);
  });

  it("输出只含判断所需字段，不含生平或加密数据", () => {
    const pairs = findDuplicateCandidates([
      row({ givenName: "守业", birthYear: 1900 }),
      row({ givenName: "守业", birthYear: 1900 }),
    ]);
    const serialized = JSON.stringify(pairs);
    for (const forbidden of ["biography", "sensitiveData", "contact", "avatarFileId"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("配对键与顺序无关，便于前端稳定渲染", () => {
    const a = row({ givenName: "守业" });
    const b = row({ givenName: "守业" });
    const forward = findDuplicateCandidates([a, b])[0].key;
    const backward = findDuplicateCandidates([b, a])[0].key;
    expect(forward).toBe(backward);
  });
});

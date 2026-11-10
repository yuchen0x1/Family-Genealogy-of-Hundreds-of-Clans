import { describe, it, expect } from "vitest";
import { normalizeSearchTerm } from "@/lib/search";

describe("查询词规范化（防存储型 XSS / 控制字符）", () => {
  it("正常中文查询不受影响", () => {
    expect(normalizeSearchTerm("李氏起源")).toBe("李氏起源");
    expect(normalizeSearchTerm("  陇西  李氏  ")).toBe("陇西 李氏");
  });

  it("拼音与英文查询不受影响", () => {
    expect(normalizeSearchTerm("li")).toBe("li");
    expect(normalizeSearchTerm("Chen Clan")).toBe("Chen Clan");
  });

  it("剥离完整的脚本标签，回显中不残留可执行标签", () => {
    expect(normalizeSearchTerm("<script>alert(1)</script>")).toBe("alert(1)");
  });

  it("剥离带属性的标签与孤立尖括号", () => {
    expect(normalizeSearchTerm('<img src=x onerror="alert(1)">')).toBe("");
    expect(normalizeSearchTerm("张<svg/onload=alert(1)>氏")).toBe("张 氏");
    expect(normalizeSearchTerm("a<b>c")).toBe("a c");
    expect(normalizeSearchTerm("a<b")).toBe("ab");
  });

  it("剥离控制字符与换行", () => {
    expect(normalizeSearchTerm("李\u0000氏\n\r寻根")).toBe("李 氏 寻根");
  });

  it("超长查询截断到 200 字，空输入返回空串", () => {
    expect(normalizeSearchTerm("李".repeat(500))).toHaveLength(200);
    expect(normalizeSearchTerm("   ")).toBe("");
    expect(normalizeSearchTerm("")).toBe("");
  });
});

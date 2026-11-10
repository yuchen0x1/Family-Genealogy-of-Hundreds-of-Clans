import { describe, it, expect } from "vitest";
import { sanitizeAuditValue } from "@/lib/audit";

describe("审计载荷脱敏", () => {
  it("敏感字段名一律替换为 [已脱敏]", () => {
    const out = sanitizeAuditValue({
      password: "x",
      passwordHash: "x",
      tokenHash: "x",
      sensitiveDataEncrypted: "x",
      ocrText: "整页 OCR 正文",
      content: "私密帖全文",
      biography: "生平传记",
    }) as Record<string, unknown>;
    for (const v of Object.values(out)) expect(v).toBe("[已脱敏]");
  });

  it("普通字段保留（审计追溯价值）", () => {
    const out = sanitizeAuditValue({ title: "标题", status: "PUBLISHED", count: 3, ok: true }) as Record<string, unknown>;
    expect(out).toEqual({ title: "标题", status: "PUBLISHED", count: 3, ok: true });
  });

  it("超长字符串截断并标注原长", () => {
    const out = sanitizeAuditValue({ note: "x".repeat(5000) }) as Record<string, string>;
    expect(out.note).toBe("[已截断，原长 5000 字符]");
  });

  it("嵌套结构递归脱敏", () => {
    const out = sanitizeAuditValue({ before: { profile: { bio: "内层生平", displayName: "某人" } } }) as {
      before: { profile: Record<string, string> };
    };
    expect(out.before.profile.bio).toBe("[已脱敏]");
    expect(out.before.profile.displayName).toBe("某人");
  });

  it("数组与空值安全", () => {
    expect(sanitizeAuditValue(null)).toBeNull();
    expect(sanitizeAuditValue(undefined)).toBeUndefined();
    expect(sanitizeAuditValue([1, "a", { content: "x" }])).toEqual([1, "a", { content: "[已脱敏]" }]);
  });

  it("过深层级被省略，不无限递归", () => {
    let deep: Record<string, unknown> = { leaf: "end" };
    for (let i = 0; i < 6; i++) deep = { child: deep };
    const out = JSON.stringify(sanitizeAuditValue(deep));
    expect(out).toContain("层级过深已省略");
  });
});

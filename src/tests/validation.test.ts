import { describe, it, expect } from "vitest";
import {
  registerSchema, loginSchema, familyCreateSchema,
  memberCreateSchema, relationshipCreateSchema, postCreateSchema,
  commentCreateSchema, messageCreateSchema,
} from "@/lib/validation";

describe("registerSchema", () => {
  it("邮箱 trim + 小写归一化", () => {
    const r = registerSchema.parse({ email: "  User@Example.COM ", password: "Passw0rd", displayName: "测试", agreeTerms: true });
    expect(r.email).toBe("user@example.com");
  });

  it("拒绝弱密码、非同意协议、空昵称", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "short1", displayName: "x", agreeTerms: true }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "Passw0rd", displayName: "x", agreeTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "Passw0rd", displayName: "  ", agreeTerms: true }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "not-an-email", password: "Passw0rd", displayName: "x", agreeTerms: true }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("邮箱归一化，密码只要求非空（登录不限制复杂度，避免老账号被拒）", () => {
    const r = loginSchema.parse({ email: " ADMIN@Example.com ", password: "any" });
    expect(r.email).toBe("admin@example.com");
    expect(loginSchema.safeParse({ email: "admin@example.com", password: "" }).success).toBe(false);
  });
});

describe("familyCreateSchema", () => {
  it("visibility 默认 PRIVATE（私有优先）", () => {
    const r = familyCreateSchema.parse({ name: "测试家族", surnameText: "陈" });
    expect(r.visibility).toBe("PRIVATE");
  });

  it("拒绝空名称与非法可见级别", () => {
    expect(familyCreateSchema.safeParse({ name: " ", surnameText: "陈" }).success).toBe(false);
    expect(familyCreateSchema.safeParse({ name: "族", surnameText: "陈", visibility: "OPEN" }).success).toBe(false);
  });
});

describe("memberCreateSchema", () => {
  it("默认值：在世、PRIVATE、性别 UNKNOWN", () => {
    const r = memberCreateSchema.parse({ surnameText: "陈", givenName: "测试" });
    expect(r.isLiving).toBe(true);
    expect(r.visibility).toBe("PRIVATE");
    expect(r.gender).toBe("UNKNOWN");
  });

  it("生卒年边界与超长字段拒绝", () => {
    expect(memberCreateSchema.safeParse({ surnameText: "陈", givenName: "甲", birthYear: 3001 }).success).toBe(false);
    expect(memberCreateSchema.safeParse({ surnameText: "陈", givenName: "甲", birthYear: -3000 }).success).toBe(true);
    expect(memberCreateSchema.safeParse({ surnameText: "陈", givenName: "甲", generationNumber: 0 }).success).toBe(false);
    expect(memberCreateSchema.safeParse({ surnameText: "陈", givenName: "甲", biography: "x".repeat(20001) }).success).toBe(false);
  });

  it("memberUpdateSchema 全部可选", () => {
    expect(memberCreateSchema.partial().safeParse({}).success).toBe(true);
  });
});

describe("relationshipCreateSchema", () => {
  const base = {
    fromPersonId: "11111111-1111-4111-8111-111111111111",
    toPersonId: "22222222-2222-4222-8222-222222222222",
    type: "PARENT_CHILD",
  };

  it("默认 subtype/verification/evidenceLevel", () => {
    const r = relationshipCreateSchema.parse(base);
    expect(r.subtype).toBe("BIOLOGICAL");
    expect(r.verification).toBe("UNVERIFIED");
    expect(r.evidenceLevel).toBe("UNVERIFIED");
  });

  it("拒绝非法关系类型与非 UUID 端点", () => {
    expect(relationshipCreateSchema.safeParse({ ...base, type: "LOVERS" }).success).toBe(false);
    expect(relationshipCreateSchema.safeParse({ ...base, fromPersonId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("postCreateSchema / comment / message", () => {
  it("帖子默认 PUBLIC 但标题内容有最小长度", () => {
    expect(postCreateSchema.parse({ title: "标题", content: "内容" }).visibility).toBe("PUBLIC");
    expect(postCreateSchema.safeParse({ title: "a", content: "内容" }).success).toBe(false);
    expect(postCreateSchema.safeParse({ title: "标题", content: "x" }).success).toBe(false);
  });

  it("评论与私信内容 trim 后非空且有上限", () => {
    expect(commentCreateSchema.parse({ content: "  你好  " }).content).toBe("你好");
    expect(commentCreateSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(commentCreateSchema.safeParse({ content: "x".repeat(5001) }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ recipientId: "bad", content: "hi" }).success).toBe(false);
  });
});

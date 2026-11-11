import { describe, it, expect, beforeAll } from "vitest";
import {
  hashPassword, verifyPassword, hashToken, randomToken,
  anonymizeIp, encryptSensitive, decryptSensitive, sha256,
} from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  process.env.SESSION_SECRET = "test-secret";
});

describe("密码哈希", () => {
  it("正确密码校验通过，错误密码失败", () => {
    const stored = hashPassword("Passw0rd_2026");
    expect(verifyPassword("Passw0rd_2026", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("同一密码两次哈希不同（每用户独立盐）", () => {
    expect(hashPassword("Passw0rd_2026")).not.toBe(hashPassword("Passw0rd_2026"));
  });

  it("畸形存储格式不抛异常且返回 false", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlytwoparts")).toBe(false);
    expect(verifyPassword("x", "bcrypt$abc$def")).toBe(false);
  });
});

describe("token 与 IP 摘要", () => {
  it("hashToken 确定性且不同 token 不同摘要", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toHaveLength(64);
  });

  it("randomToken 每次不同且 URL 安全", () => {
    const t = randomToken(24);
    expect(t).not.toBe(randomToken(24));
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("anonymizeIp 确定性、不泄漏原文、不同 IP 不同摘要", () => {
    const a = anonymizeIp("203.0.113.7");
    expect(a).toBe(anonymizeIp("203.0.113.7"));
    expect(a).not.toContain("203.0.113.7");
    expect(a).not.toBe(anonymizeIp("203.0.113.8"));
  });

  it("sha256 稳定", () => {
    expect(sha256("test")).toBe(sha256("test"));
    expect(sha256("test")).toHaveLength(64);
  });
});

describe("AES-256-GCM 敏感字段加密", () => {
  it("加密解密往返一致，密文不包含明文", () => {
    const plain = "身份证号 110101199001011234";
    const cipher = encryptSensitive(plain);
    expect(cipher).not.toContain(plain);
    expect(decryptSensitive(cipher)).toBe(plain);
  });

  it("每次加密结果不同（随机 IV）", () => {
    expect(encryptSensitive("同一内容")).not.toBe(encryptSensitive("同一内容"));
  });

  it("篡改密文导致解密失败（GCM 认证）", () => {
    const cipher = encryptSensitive("secret");
    const [iv, tag, data] = cipher.split(".");
    const flipped = data[0] === "A" ? "B" : "A";
    const tampered = `${iv}.${tag}.${flipped}${data.slice(1)}`;
    expect(() => decryptSensitive(tampered)).toThrow();
  });

  it("格式错误与缺密钥均明确抛错", () => {
    expect(() => decryptSensitive("bad-format")).toThrow("密文格式错误");
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSensitive("x")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = saved;
  });
});

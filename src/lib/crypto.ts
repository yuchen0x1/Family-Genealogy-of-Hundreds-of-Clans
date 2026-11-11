import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

/** 密码哈希：scrypt(N=2^14, r=8, p=1) + 每用户独立随机盐。格式 scrypt$<salt>$<hash> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(password, parts[1], expected.length, { N: SCRYPT_COST });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** 会话 token 摘要：数据库中只保存摘要，泄露数据库也不会导致会话被冒用。 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** IP 脱敏：只保存带密钥的 HMAC，避免日志留存原始 IP。 */
export function anonymizeIp(ip: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET || "xungen").update(ip).digest("hex");
}

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("ENCRYPTION_KEY 必须是 64 位 hex（32 字节）");
  }
  return Buffer.from(raw, "hex");
}

/** 人物敏感字段加密（AES-256-GCM）。公开查询永不返回此字段。 */
export function encryptSensitive(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), payload.toString("base64")].join(".");
}

export function decryptSensitive(value: string): string {
  const [ivB64, tagB64, dataB64] = value.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("密文格式错误");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

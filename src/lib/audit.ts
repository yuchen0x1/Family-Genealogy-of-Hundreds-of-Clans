import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { clientIpHash } from "./api";

/**
 * 审计载荷脱敏：审计日志是安全追溯用途，不得成为绕过「后台不返回私有族谱人物明细、
 * 档案正文与私密内容」承诺的旁路。写入前与后台读取前均套用本函数（读取侧覆盖历史存量行）。
 */
const REDACT_KEYS = /^(password|passwordHash|token|tokenHash|sessionToken|secret|authorization|cookie|sensitiveData|sensitiveDataEncrypted|ocrText|content|body|biography|bio|epitaph)$/i;
const MAX_STRING = 300;
const MAX_DEPTH = 4;

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `[已截断，原长 ${value.length} 字符]` : value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[层级过深已省略]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeAuditValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "[已脱敏]" : sanitizeAuditValue(v, depth + 1);
  }
  return out;
}

/** 关键写操作留痕（含管理员操作），用于安全审计与版本追溯。 */
export async function audit(
  req: Request,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  extra?: { before?: unknown; after?: unknown },
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        before: extra?.before === undefined ? Prisma.JsonNull : (sanitizeAuditValue(extra.before) as Prisma.InputJsonValue),
        after: extra?.after === undefined ? Prisma.JsonNull : (sanitizeAuditValue(extra.after) as Prisma.InputJsonValue),
        ipHash: clientIpHash(req),
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
  } catch (e) {
    // 审计失败不应阻断主业务，但必须记录
    console.error("[audit] 写入失败:", e);
  }
}

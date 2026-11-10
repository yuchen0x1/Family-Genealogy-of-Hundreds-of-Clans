import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sanitizeAuditValue } from "@/lib/audit";

/** 审计日志：可按动作、实体类型、操作者筛选；IP 仅存脱敏摘要。 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const { q, page, pageSize, params } = getQuery(req);
  const action = params.get("action");
  const entityType = params.get("entityType");
  const actorId = params.get("actorId");
  const where = {
    ...(action ? { action: { contains: action } } : {}),
    ...(entityType ? { entityType } : {}),
    ...(actorId ? { actorId } : {}),
    ...(q ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, actorId: true, action: true, entityType: true, entityId: true,
        before: true, after: true, ipHash: true, userAgent: true, createdAt: true,
        actor: { select: { profile: { select: { displayName: true } } } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  // 读取侧再次脱敏：覆盖写入侧修复前的历史存量行
  const items = rows.map((r) => ({
    ...r,
    before: r.before == null ? r.before : sanitizeAuditValue(r.before),
    after: r.after == null ? r.after : sanitizeAuditValue(r.after),
  }));
  return ok({ ...paginate(items, total, page, pageSize), notice: "IP 为 HMAC 脱敏摘要；审计日志不包含密码、会话令牌、人物生平、私密帖正文与上传文件/OCR 正文。" });
});

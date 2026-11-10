import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, getQuery, paginate, ApiError, assertRateLimit } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { REPORT_REASONS } from "@/lib/community";
import { audit } from "@/lib/audit";

const schema = z.object({
  targetType: z.enum(["POST", "COMMENT", "MESSAGE", "USER", "SURNAME", "DOCUMENT", "FAMILY"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(4, "请说明举报原因").max(1000),
});

/** 举报/纠错：任何登录用户可提交；结果仅提交者本人与审核人员可见。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await assertRateLimit(`report.create:${user.id}`, 10, 300);
  const data = await parseBody(schema, req);
  if (!REPORT_REASONS.includes(data.reason as typeof REPORT_REASONS[number]) && data.reason.length < 4) {
    throw new ApiError(400, "举报原因过短", "INVALID_REASON");
  }
  const duplicate = await prisma.report.findFirst({
    where: { reporterId: user.id, targetType: data.targetType, targetId: data.targetId, status: { in: ["OPEN", "IN_REVIEW"] } },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, "该内容已提交过举报，正在处理中", "ALREADY_REPORTED");

  const report = await prisma.report.create({
    data: { reporterId: user.id, targetType: data.targetType, targetId: data.targetId, reason: data.reason, status: "OPEN" },
  });
  await audit(req, user.id, "report.create", "report", report.id, {
    after: { targetType: data.targetType, targetId: data.targetId },
  });
  return ok({
    id: report.id, status: report.status,
    notice: "举报已提交，由内容审核人员处理。平台不会因举报内容自动认定史料或亲属关系有误。",
  }, 201);
});

/** 我的举报记录（管理员用 /api/admin/reports 查看全量）。 */
export const GET = route(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const { page, pageSize } = getQuery(req);
  const where = { reporterId: user.id };
  const [rows, total] = await Promise.all([
    prisma.report.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.report.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireReviewer } from "@/lib/admin";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]),
  resolution: z.string().trim().min(4, "请填写处理说明").max(1000),
});

export const GET = route(async (req: NextRequest) => {
  await requireReviewer();
  const { page, pageSize, params } = getQuery(req);
  const status = params.get("status");
  const where = status ? { status: status as never } : {};
  const [rows, total] = await Promise.all([
    prisma.report.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      include: {
        reporter: { select: { id: true, profile: { select: { displayName: true } } } },
        handler: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    }),
    prisma.report.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

/** 处理举报：只改状态与处理结论，不自动删除被举报内容或改写史料结论。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const reviewer = await requireReviewer();
  const data = await parseBody(patchSchema, req);
  const report = await prisma.report.findUnique({ where: { id: data.id } });
  if (!report) throw new ApiError(404, "举报不存在", "NOT_FOUND");
  const updated = await prisma.report.update({
    where: { id: data.id },
    data: { status: data.status as never, resolution: data.resolution, handledById: reviewer.id },
  });
  await audit(req, reviewer.id, "admin.report.handle", "report", data.id, {
    before: { status: report.status }, after: { status: updated.status, resolution: data.resolution },
  });
  return ok({
    id: updated.id, status: updated.status,
    notice: "处理结果已记录。系统不会因举报自动删除内容或改变史料可信程度；如需处置请在对应内容审核入口单独操作。",
  });
});

import { prisma } from "@/lib/db";
import { ok, route, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyReview } from "@/lib/permissions";

type Ctx = { id: string; jobId: string };

/** 查看导入报告；不返回完整 payload，避免一次性暴露待导入原始数据。 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, jobId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyReview(user, id);
  const job = await prisma.importJob.findFirst({
    where: { id: jobId, familyId: id },
    select: {
      id: true, format: true, fileName: true, status: true, report: true,
      createdAt: true, completedAt: true,
    },
  });
  if (!job) throw new ApiError(404, "导入任务不存在", "NOT_FOUND");
  return ok(job);
});

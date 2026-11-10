import { z } from "zod";
import { ok, route, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getJob, healStaleJobs, toJobView } from "@/lib/updater";

const jobIdSchema = z.string().uuid();

/**
 * 轮询单个更新任务的进度。
 *
 * 前端在更新进行中高频调用（约 1.5 秒一次），因此这里刻意保持轻量：
 * 只读一行 + 顺带做一次惰性自愈（更新期间被重启打断的任务会在下一次
 * 轮询时被判为成功或失败，而不是永远停在 RUNNING）。
 */
export const GET = route<{ jobId: string }>(async (_req, ctx) => {
  await requireAdmin();
  const { jobId } = await ctx.params;
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) throw new ApiError(400, "任务 ID 格式不正确", "INVALID_JOB_ID");

  // 先自愈再读，避免前端拿到一个已经被打断却仍显示 RUNNING 的假状态
  await healStaleJobs();

  const job = await getJob(parsed.data);
  if (!job) throw new ApiError(404, "更新任务不存在", "JOB_NOT_FOUND");

  return ok(toJobView(job), 200, { "Cache-Control": "no-store" });
});

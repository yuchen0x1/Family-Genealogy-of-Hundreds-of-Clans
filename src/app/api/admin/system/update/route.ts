import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route, parseBody, assertSameOrigin, assertRateLimit, clientIpHash } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getUpdateState, applyUpdate } from "@/lib/updater";

/** 更新状态会实时反映上游版本，禁止任何中间层缓存。 */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 读取更新状态：当前版本、上游版本、配对信息、最近任务。
 *
 * 仅管理员可读。虽然不是写操作，但上游版本与实例标识属于运维信息，
 * 不应暴露给普通用户。
 */
export const GET = route(async () => {
  await requireAdmin();
  const state = await getUpdateState();
  return ok(state, 200, NO_STORE);
});

const applySchema = z.object({
  /** 显式确认字面量，与项目内导入/恢复/注销等危险操作保持同一套防误触约定 */
  confirm: z.literal("UPDATE", { error: "更新需显式确认（需提交 confirm: \"UPDATE\"）" }),
});

/**
 * 发起更新。
 *
 * 目标版本由服务端根据当前上游结果决定，前端不传任何版本参数——
 * 否则前端可以指定任意版本把实例降级，或指向不存在的 ref。
 * 执行过程异步进行，接口立即返回任务快照，前端轮询进度。
 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  // 更新是高代价操作，独立限流桶：即使被 CSRF 绕过也不允许短时间反复触发
  await assertRateLimit(`update:apply:${admin.id}:${clientIpHash(req)}`, 5, 600);

  await parseBody(applySchema, req);

  const job = await applyUpdate(admin.id);

  await audit(req, admin.id, "admin.system.update.apply", "update_job", job.id, {
    after: {
      fromVersion: job.fromVersion,
      targetVersion: job.targetVersion,
      driver: job.driver,
    },
  });

  return ok(job, 202, NO_STORE);
});

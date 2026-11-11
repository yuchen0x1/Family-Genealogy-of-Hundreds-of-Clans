/**
 * 更新模块对外入口。
 */
import { createJob } from "./jobs";
import { resolveUpdateTarget, toJobView, type JobView } from "./status";
import { prepareUpdateArtifact, runUpdateInApp } from "./apply";
import { runDockerUpdate, runSimulatedUpdate } from "./drivers";

export * from "./status";
export * from "./jobs";
export { readLocalVersion, compareVersions, normalizeVersion } from "./version";
export { ensurePairing, isSimulateAllowed, shortInstanceId } from "./config";

/**
 * 发起一次更新。
 *
 * 目标版本在服务端根据当前上游结果确定，前端无权指定，避免被引导去装旧版本
 * 或不存在的 ref。
 *
 * 注意：实际执行在响应返回之后继续跑。本项目是自托管 Node 进程（next start），
 * 不部署到会冻结请求上下文的 Serverless 环境，因此这种「后台继续执行」是可用的；
 * 若将来迁移到 Serverless，必须改为队列 + 独立 worker。
 */
export async function applyUpdate(userId: string): Promise<JobView> {
  const { state, target, driver } = await resolveUpdateTarget();

  const job = await createJob({
    instanceId: state.pairing.instanceId,
    fromVersion: state.current.version,
    targetVersion: target.version,
    driver,
    requestedById: userId,
  });

  const jobId = job.id;
  const failSafe = (err: unknown) => {
    console.error("[updater] 更新任务异常:", err);
  };

  if (driver === "SIMULATE") {
    void runSimulatedUpdate(jobId, target).catch(failSafe);
  } else if (driver === "DOCKER") {
    void (async () => {
      try {
        const staging = await prepareUpdateArtifact(jobId, state.pairing.repo, target);
        await runDockerUpdate(jobId, target, staging);
      } catch (err) {
        const { finishJob } = await import("./jobs");
        const message = err instanceof Error ? err.message : String(err);
        await finishJob(jobId, "FAILED", { message: "更新失败", error: message }).catch(failSafe);
        failSafe(err);
      }
    })();
  } else {
    void runUpdateInApp(jobId, state.pairing.repo, target).catch(failSafe);
  }

  return toJobView(job);
}

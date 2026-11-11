/**
 * 非源码场景的两种驱动。
 *
 * DOCKER：容器内改代码是无效的（镜像已固化），必须重建镜像并重启容器。
 * 而给 Web 进程挂 docker.sock 等于把宿主机 root 交给一个可被 Web 请求触发的进程，
 * 因此这里只写一个「请求重建」标记，由独立的 updater sidecar 消费。
 *
 * SIMULATE：不触碰任何文件，只推进状态机，用于演示与端到端测试。
 * 生产环境由 config.isSimulateAllowed() 拦截，避免有人把它当成真实更新。
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { patchJob, finishJob } from "./jobs";
import type { UpstreamRelease } from "./github";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const DOCKER_RESTART_FLAG = "docker-restart.requested";

/** 写重建标记。sidecar 从共享卷中的 staging 目录构建新镜像，并回写结果状态。 */
export async function requestDockerRebuild(jobId: string, target: UpstreamRelease, staging: string): Promise<string> {
  const safeStaging = basename(staging);
  if (!/^staging-[A-Za-z0-9._-]{1,100}$/.test(safeStaging)) {
    throw new Error("更新暂存目录标识非法");
  }
  const dir = join(process.cwd(), ".storage", "update");
  await mkdir(dir, { recursive: true });
  const flagPath = join(dir, DOCKER_RESTART_FLAG);
  const tmpPath = join(dir, `.docker-restart.${process.pid}.${Date.now()}.tmp`);
  await writeFile(
    tmpPath,
    JSON.stringify(
      {
        jobId,
        targetVersion: target.version,
        commit: target.commit ?? "",
        tag: target.tagName,
        staging: safeStaging,
        requestedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { encoding: "utf8", mode: 0o600 },
  );
  await rename(tmpPath, flagPath);
  return flagPath;
}

export async function runDockerUpdate(jobId: string, target: UpstreamRelease, staging: string): Promise<void> {
  await patchJob(
    jobId,
    { status: "RUNNING", stage: "INSTALL", progress: 86, message: "正在准备镜像重建", startedAt: new Date() },
    { level: "info", text: "容器部署：发布包已校验，交由 sidecar 同步源码并重建镜像" },
  );

  try {
    await requestDockerRebuild(jobId, target, staging);
    await patchJob(
      jobId,
      { stage: "RESTART", progress: 90, message: "已提交重建请求，等待 sidecar 同步源码并重启容器" },
      { level: "info", text: "已写入重建标记，由 updater sidecar 执行固定同步与 docker compose build/up" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJob(jobId, "FAILED", { message: "无法提交容器更新请求", error: message });
    throw err;
  }
}

/**
 * 模拟更新：推进阶段但不动文件，最后标记成功并明确注明「模拟」。
 * 不写 activeLock 释放以外的任何副作用。
 */
export async function runSimulatedUpdate(jobId: string, target: UpstreamRelease): Promise<void> {
  const steps: Array<{ stage: "BACKUP" | "DOWNLOAD" | "VERIFY" | "INSTALL" | "RESTART"; to: number; message: string }> = [
    { stage: "BACKUP", to: 12, message: "模拟：正在备份数据" },
    { stage: "DOWNLOAD", to: 35, message: `模拟：正在下载 ${target.version}` },
    { stage: "DOWNLOAD", to: 62, message: `模拟：正在下载 ${target.version}` },
    { stage: "VERIFY", to: 78, message: "模拟：正在校验发布包" },
    { stage: "INSTALL", to: 92, message: "模拟：正在安装并构建" },
    { stage: "RESTART", to: 97, message: "模拟：正在重启服务" },
  ];

  await patchJob(
    jobId,
    { status: "RUNNING", stage: "BACKUP", progress: 3, message: "模拟更新开始", startedAt: new Date() },
    { level: "info", text: "使用 SIMULATE 驱动，不会改动任何文件" },
  );

  for (const step of steps) {
    await sleep(700);
    await patchJob(jobId, { stage: step.stage, progress: step.to, message: step.message });
  }

  await finishJob(jobId, "SUCCEEDED", {
    message: "模拟更新已完成（未改动任何文件）",
    stage: "DONE",
  });
}

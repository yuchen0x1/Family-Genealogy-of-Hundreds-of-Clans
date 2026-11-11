/**
 * 更新任务的生命周期。
 *
 * 关键约束：
 * 1. 同一实例同一时刻只允许一个活跃任务。靠 update_jobs.active_lock 唯一索引兜底，
 *    应用层再给一次友好报错，避免「两个人同时点立即更新」把构建产物写坏。
 * 2. 进度必须落库。因为「下载完成后重启」会让原进程消失，新进程只能从数据库
 *    得知上一次更新走到哪一步、是成功还是失败。
 * 3. 任务不能永久悬挂。进程被重启打断时留下的 RUNNING 行必须被收尾，否则后台
 *    再也发不起更新——用 healStaleJobs 在读取状态时惰性自愈。
 */
import { Prisma } from "@prisma/client";
import type { UpdateDriver, UpdateJob, UpdateStage, UpdateStatus } from "@prisma/client";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { readLocalVersion } from "./version";

export type JobLogLevel = "info" | "warn" | "error";
export type JobLogEntry = { at: string; level: JobLogLevel; text: string };

/** 单任务日志上限，防止一次失败的构建日志把 JSON 字段撑爆 */
const MAX_LOG_ENTRIES = 200;
/**
 * 判定「进程已被打断」的静默阈值。
 *
 * 必须长于最长的「无进度写入」阶段，否则会把正常更新误判为失败：
 * 独立安装进程的 `pnpm install`、`prisma generate`、`pnpm build` 各自允许
 * 20 分钟（见 update-apply.mjs 的 INSTALL_TIMEOUT_MS），期间只在阶段切换时写库。
 * 因此取 45 分钟，并以最后一次写库时间（updatedAt）而不是开始时间计时。
 */
const STALE_RUNNING_MS = 45 * 60 * 1000;
/** QUEUED 超过该时长仍未开始，说明执行器根本没起来 */
const STALE_QUEUED_MS = 2 * 60 * 1000;
/**
 * DOCKER 驱动：sidecar 报成功之后等待新容器以目标版本启动的上限。
 * 超时说明「Compose 命令成功了但新容器没起来或版本没变」，必须判失败并释放锁，
 * 否则任务会一直挂在 RUNNING，后台再也发不起下一次更新。
 */
const STALE_DOCKER_CONFIRM_MS = 10 * 60 * 1000;
const ACTIVE_LOCK = "global";
const DOCKER_RESULT_PATH = join(process.cwd(), ".storage", "update", "docker-restart.last");
const DOCKER_PROCESSING_PATH = join(process.cwd(), ".storage", "update", "docker-restart.processing");
const DOCKER_WAITING_MESSAGE = "Compose 更新已提交，等待新应用确认目标版本";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readDockerMarker(path: string): Promise<Record<string, unknown> | null> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) return null;
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readDockerResult(): Promise<{ jobId: string; status: "FAILED" | "SUCCEEDED"; reason: string; at: Date | null } | null> {
  const parsed = await readDockerMarker(DOCKER_RESULT_PATH);
  if (
    typeof parsed?.jobId !== "string" ||
    !UUID_PATTERN.test(parsed.jobId) ||
    (parsed.status !== "FAILED" && parsed.status !== "SUCCEEDED") ||
    typeof parsed.reason !== "string"
  ) return null;
  // sidecar 写入的 at 是 UTC ISO 字符串；解析失败时退回 null，由调用方用 updatedAt 兜底
  const at = typeof parsed.at === "string" ? new Date(parsed.at) : null;
  return {
    jobId: parsed.jobId,
    status: parsed.status,
    reason: parsed.reason.slice(0, 200),
    at: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}

async function readDockerProcessingJobId(): Promise<string | null> {
  const parsed = await readDockerMarker(DOCKER_PROCESSING_PATH);
  return typeof parsed?.jobId === "string" && UUID_PATTERN.test(parsed.jobId) ? parsed.jobId : null;
}

/**
 * 判断「目标版本是否已成为当前运行的版本」。
 *
 * targetVersion 有两种形态：
 * - stable 通道：语义化版本号（如 1.4.0），与 package.json 比对
 * - branch 通道：commit SHA 前缀（如 abcdef123456），必须与构建注入的完整
 *   APP_BUILD_SHA 比对。只认 40 位完整 SHA 是不够的——buildBranch 返回的是
 *   12 位前缀，会把成功更新误判为「尚未生效」而一直等到超时失败。
 */
function targetVersionMatches(targetVersion: string, current: ReturnType<typeof readLocalVersion>): boolean {
  const target = targetVersion.trim();
  if (/^[0-9a-f]{7,64}$/i.test(target)) {
    if (!/^[0-9a-f]{7,64}$/i.test(current.commit)) return false;
    // 前缀比较：上游可能只给短 SHA，运行中的 commit 是完整 SHA
    return current.commit.toLowerCase().startsWith(target.toLowerCase());
  }
  return target === current.version;
}

export const STAGE_LABELS: Record<UpdateStage, string> = {
  QUEUED: "排队中",
  BACKUP: "备份数据",
  DOWNLOAD: "下载新版本",
  VERIFY: "校验发布包",
  INSTALL: "安装并构建",
  RESTART: "重启服务",
  DONE: "已完成",
};

export function readLog(job: Pick<UpdateJob, "log">): JobLogEntry[] {
  const raw = job.log;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const text = typeof e.text === "string" ? e.text : "";
      if (!text) return null;
      const level = (["info", "warn", "error"] as const).includes(e.level as JobLogLevel)
        ? (e.level as JobLogLevel)
        : "info";
      return { at: typeof e.at === "string" ? e.at : new Date(0).toISOString(), level, text };
    })
    .filter((e): e is JobLogEntry => e !== null);
}

function serializeLog(entries: JobLogEntry[]): Prisma.InputJsonValue {
  return entries.slice(-MAX_LOG_ENTRIES) as unknown as Prisma.InputJsonValue;
}

/**
 * 创建任务。并发发起时由唯一索引拦下第二个，转成 409 而不是 500。
 */
export async function createJob(input: {
  instanceId: string;
  fromVersion: string;
  targetVersion: string;
  driver: UpdateDriver;
  requestedById: string;
}): Promise<UpdateJob> {
  if (input.targetVersion === input.fromVersion) {
    throw new ApiError(409, "当前已是最新版本，无需更新", "ALREADY_UP_TO_DATE");
  }
  try {
    return await prisma.updateJob.create({
      data: {
        instanceId: input.instanceId,
        fromVersion: input.fromVersion,
        targetVersion: input.targetVersion,
        driver: input.driver,
        status: "QUEUED",
        stage: "QUEUED",
        progress: 0,
        message: "更新任务已创建，等待执行",
        activeLock: ACTIVE_LOCK,
        requestedById: input.requestedById,
        log: serializeLog([
          { at: new Date().toISOString(), level: "info", text: `任务创建：${input.fromVersion} → ${input.targetVersion}（驱动 ${input.driver}）` },
        ]),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "已有更新任务正在执行，请等待其完成", "UPDATE_IN_PROGRESS");
    }
    throw err;
  }
}

export async function getJob(jobId: string): Promise<UpdateJob | null> {
  return prisma.updateJob.findUnique({ where: { id: jobId } });
}

export async function getActiveJob(): Promise<UpdateJob | null> {
  return prisma.updateJob.findFirst({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestJob(): Promise<UpdateJob | null> {
  return prisma.updateJob.findFirst({ orderBy: { createdAt: "desc" } });
}

/** 进度更新 + 追加日志（同一次调用只写一次库，减少 IO）。 */
export async function patchJob(
  jobId: string,
  patch: {
    status?: UpdateStatus;
    stage?: UpdateStage;
    progress?: number;
    message?: string;
    error?: string | null;
    artifactPath?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
    clearLock?: boolean;
  },
  logEntry?: Omit<JobLogEntry, "at">,
): Promise<UpdateJob> {
  const current = await prisma.updateJob.findUnique({ where: { id: jobId }, select: { log: true } });
  const entries = current ? readLog({ log: current.log }) : [];
  if (logEntry) {
    entries.push({ at: new Date().toISOString(), level: logEntry.level, text: logEntry.text });
  }

  const data: Prisma.UpdateJobUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.stage !== undefined) data.stage = patch.stage;
  if (patch.progress !== undefined) data.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  if (patch.message !== undefined) data.message = patch.message.slice(0, 500);
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.artifactPath !== undefined) data.artifactPath = patch.artifactPath;
  if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
  if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
  if (patch.clearLock) data.activeLock = null;
  if (logEntry) data.log = serializeLog(entries);

  return prisma.updateJob.update({ where: { id: jobId }, data });
}

export async function finishJob(
  jobId: string,
  status: Extract<UpdateStatus, "SUCCEEDED" | "FAILED" | "CANCELLED">,
  options: { message: string; error?: string | null; stage?: UpdateStage } = { message: "" },
): Promise<UpdateJob> {
  return patchJob(
    jobId,
    {
      status,
      stage: options.stage,
      progress: status === "SUCCEEDED" ? 100 : undefined,
      message: options.message,
      error: options.error ?? null,
      finishedAt: new Date(),
      clearLock: true,
    },
    { level: status === "SUCCEEDED" ? "info" : "error", text: options.message },
  );
}

/**
 * 自愈：收尾被进程重启打断、或执行器从未启动的悬挂任务。
 *
 * 判定顺序很重要——先看「目标版本是否已成为当前版本」：
 * 更新成功后服务重启，此时任务还是 RUNNING，但目标版本已经生效，
 * 应当立即判成功，而不是等超时后误判失败。
 *
 * @returns 本次实际收尾的任务数
 */
export async function healStaleJobs(): Promise<number> {
  const now = Date.now();
  const current = readLocalVersion();
  let healed = 0;
  const dockerResult = await readDockerResult();
  const dockerProcessingJobId = await readDockerProcessingJobId();

  const running = await prisma.updateJob.findMany({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "asc" },
    take: 20,
  });

  for (const job of running) {
    // 1) 目标版本是否已经生效？对所有驱动都先判这一条。
    //    更新成功的重启会让原进程消失，此时任务仍是 RUNNING，但新版本已经在跑，
    //    必须据此立即收尾为成功，不能等到超时再判失败。
    if (targetVersionMatches(job.targetVersion, current)) {
      await patchJob(
        job.id,
        {
          status: "SUCCEEDED",
          stage: "DONE",
          progress: 100,
          message: "更新已完成，服务已重启",
          error: null,
          finishedAt: new Date(),
          clearLock: true,
        },
        { level: "info", text: `检测到当前版本已是 ${current.version}，任务收尾为成功` },
      );
      healed += 1;
      continue;
    }

    // 2) Docker：sidecar 已回写结果
    if (job.driver === "DOCKER" && dockerResult?.jobId === job.id) {
      if (dockerResult.status === "FAILED") {
        await finishJob(job.id, "FAILED", {
          message: "Docker 镜像更新失败",
          error: `updater sidecar 失败：${dockerResult.reason || "未知错误"}。请检查 updater 日志后重试`,
        });
        healed += 1;
        continue;
      }
      // 只在状态真正变化时写库：轮询每 1.5 秒读一次状态，无条件 patch 会
      // 每次追加一条日志，还把 updatedAt 一直刷新，导致下面的超时判定永不生效。
      if (job.stage !== "RESTART" || job.progress < 98) {
        await patchJob(
          job.id,
          {
            stage: "RESTART",
            progress: 98,
            message: DOCKER_WAITING_MESSAGE,
          },
          { level: "info", text: "updater sidecar 已完成 Compose build/up，等待新应用启动并确认版本" },
        );
      }
      // 以「sidecar 完成时刻」为起点计超时：新容器若始终没起来，
      // 不能用被杀掉的旧进程的 updatedAt 永远拖住这个任务。
      const waitingSince = dockerResult.at?.getTime() ?? job.updatedAt.getTime();
      if (now - waitingSince > STALE_DOCKER_CONFIRM_MS) {
        await finishJob(job.id, "FAILED", {
          message: "Docker 更新未生效",
          error: "updater sidecar 报告构建与重启成功，但新容器迟迟未以目标版本启动；请检查 app 容器日志与镜像标签后重试",
        });
        healed += 1;
      }
      continue;
    }
    if (job.driver === "DOCKER" && dockerProcessingJobId === job.id) {
      // Sidecar 正在构建/重启；构建耗时不受常规 stale 超时限制。
      continue;
    }
    // 用最后一次写库时间判断「静默」，而不是开始时间：
    // 安装阶段可能连续 20 分钟只在阶段切换时写一次库。
    const lastActivityAt = job.updatedAt?.getTime() ?? job.startedAt?.getTime() ?? job.createdAt.getTime();
    if (now - lastActivityAt > STALE_RUNNING_MS) {
      await finishJob(job.id, "FAILED", {
        message: "更新进程在完成前退出",
        error: "构建或重启阶段中断（可能是构建报错、内存不足或服务被手动停止），请查看服务端日志后重试",
      });
      healed += 1;
    }
  }

  const queued = await prisma.updateJob.findMany({ where: { status: "QUEUED" }, take: 20 });
  for (const job of queued) {
    if (now - job.createdAt.getTime() > STALE_QUEUED_MS) {
      await finishJob(job.id, "FAILED", {
        message: "更新任务未能启动",
        error: "任务长时间停留在排队状态，可能是服务在启动任务前被重启",
      });
      healed += 1;
    }
  }

  return healed;
}

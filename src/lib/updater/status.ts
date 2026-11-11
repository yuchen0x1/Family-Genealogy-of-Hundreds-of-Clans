/**
 * 更新状态聚合：把「当前版本 / 上游版本 / 配对信息 / 最近任务」组装成一份
 * 后台可直接渲染的状态。
 *
 * 设计取舍：上游检查失败不抛 500。当前版本与配对信息是本地事实，必须照常展示；
 * 上游不可达只应作为一个附带说明，否则一次网络抖动就会让整个后台页面白屏。
 */
import type { UpdateDriver, UpdateJob, UpdateStage, UpdateStatus } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { ensurePairing, isSimulateAllowed, type PairingInfo } from "./config";
import { fetchUpstream, UpstreamError, type UpstreamRelease } from "./github";
import { compareVersions, readLocalVersion, type LocalVersion } from "./version";
import { getActiveJob, getLatestJob, healStaleJobs, readLog, STAGE_LABELS, type JobLogEntry } from "./jobs";

export type JobView = {
  id: string;
  status: UpdateStatus;
  stage: UpdateStage;
  stageLabel: string;
  progress: number;
  message: string | null;
  error: string | null;
  fromVersion: string;
  targetVersion: string;
  driver: UpdateDriver;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  log: JobLogEntry[];
};

export function toJobView(job: UpdateJob): JobView {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    stageLabel: STAGE_LABELS[job.stage] ?? job.stage,
    progress: job.progress,
    message: job.message,
    error: job.error,
    fromVersion: job.fromVersion,
    targetVersion: job.targetVersion,
    driver: job.driver,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    log: readLog(job),
  };
}

export type UpdateState = {
  current: LocalVersion;
  pairing: PairingInfo;
  upstream: UpstreamRelease | null;
  upstreamError: { code: string; message: string } | null;
  updateAvailable: boolean;
  /** 无法判断是否有新版本时的原因（例如容器内没有 commit 信息） */
  undeterminedReason: string | null;
  simulateAllowed: boolean;
  /** 更新前是否强制备份 */
  backupRequired: boolean;
  activeJob: JobView | null;
  latestJob: JobView | null;
};

export type UpdateStateOptions = {
  /** 跳过缓存，用于用户手动点「检查更新」 */
  force?: boolean;
};

/**
 * 判断是否有更新。
 * - stable 通道：语义化版本比较
 * - branch 通道：只能判断 commit 是否相同（无法比较大小，因为提交不构成有序版本）
 */
function decideAvailability(
  current: LocalVersion,
  upstream: UpstreamRelease,
  pairing: PairingInfo,
): { available: boolean; reason: string | null } {
  if (pairing.channel === "branch") {
    if (!current.commit || current.commit === "unknown") {
      return {
        available: false,
        reason: "当前部署缺少 commit 信息（镜像未注入 APP_BUILD_SHA），无法按分支通道比对，请改用 stable 通道或重新构建镜像",
      };
    }
    return { available: upstream.commit !== current.commit, reason: null };
  }
  const cmp = compareVersions(upstream.version, current.version);
  return { available: cmp > 0, reason: null };
}

export async function getUpdateState(options: UpdateStateOptions = {}): Promise<UpdateState> {
  // 惰性自愈：任何一次读取都顺带收尾被重启打断的任务，不依赖启动钩子
  await healStaleJobs();

  const pairing = await ensurePairing();
  const current = readLocalVersion();

  let upstream: UpstreamRelease | null = null;
  let upstreamError: UpdateState["upstreamError"] = null;
  try {
    upstream = await fetchUpstream({
      repo: pairing.repo,
      channel: pairing.channel,
      branch: pairing.branch,
      force: options.force,
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      upstreamError = { code: err.code, message: err.message };
    } else {
      console.error("[updater] 上游检查异常:", err);
      upstreamError = { code: "UNKNOWN", message: "检查上游版本时发生未知错误" };
    }
  }

  let updateAvailable = false;
  let undeterminedReason: string | null = null;
  if (upstream) {
    const decision = decideAvailability(current, upstream, pairing);
    updateAvailable = decision.available;
    undeterminedReason = decision.reason;
  }

  const [activeJob, latestJob] = await Promise.all([getActiveJob(), getLatestJob()]);

  return {
    current,
    pairing,
    upstream,
    upstreamError,
    updateAvailable,
    undeterminedReason,
    simulateAllowed: isSimulateAllowed(),
    backupRequired: process.env.APP_UPDATE_SKIP_BACKUP !== "true",
    activeJob: activeJob ? toJobView(activeJob) : null,
    latestJob: latestJob ? toJobView(latestJob) : null,
  };
}

/**
 * 发起更新前的最终校验。
 * 目标版本由服务端根据当前上游结果确定，绝不采用前端传入的版本号——
 * 否则前端可以指定任意「目标版本」，把更新器引向不存在的 tag 或旧版本降级。
 */
export async function resolveUpdateTarget(): Promise<{
  state: UpdateState;
  target: UpstreamRelease;
  driver: UpdateDriver;
}> {
  const state = await getUpdateState({ force: true });

  if (state.activeJob) {
    throw new ApiError(409, "已有更新任务正在执行，请等待其完成", "UPDATE_IN_PROGRESS");
  }
  if (state.upstreamError || !state.upstream) {
    throw new ApiError(
      502,
      `无法获取上游版本：${state.upstreamError?.message ?? "未知原因"}`,
      "UPSTREAM_UNAVAILABLE",
    );
  }
  if (state.undeterminedReason) {
    throw new ApiError(409, state.undeterminedReason, "CANNOT_DETERMINE_VERSION");
  }
  if (!state.updateAvailable) {
    throw new ApiError(409, "当前已是最新版本，无需更新", "ALREADY_UP_TO_DATE");
  }

  const driver = state.pairing.driver;
  if (driver === "SIMULATE" && !state.simulateAllowed) {
    // 生产环境误配 SIMULATE 时不应静默降级成假更新，直接拒绝更安全
    throw new ApiError(403, "当前环境不允许使用模拟更新驱动", "SIMULATE_FORBIDDEN");
  }

  return { state, target: state.upstream, driver };
}

/**
 * 更新执行器的应用内部分。
 *
 * 分工理由：下载与校验在 Web 进程内完成，因为只有这里能实时把进度写给前端；
 * 而「覆盖源码 → 安装依赖 → 构建 → 重启」必须交给独立进程——构建会替换 .next，
 * 在运行中的进程里构建等于自己踩自己的产物，重启更是要结束当前进程。
 *
 * 因此 update-apply.mjs 以 detached 方式启动，构建完成后重启应用；
 * 应用重启后由 healStaleJobs 依据「目标版本是否已成为当前版本」收尾任务状态。
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inspectTarGz } from "./archive";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ApiError } from "@/lib/api";
import { patchJob, finishJob } from "./jobs";
import { githubToken } from "./config";
import type { UpstreamRelease } from "./github";

/** 源码包体积上限，防止异常上游把磁盘写满 */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;
/** 源码包下载阶段在总进度里占用的区间 */
const DOWNLOAD_FROM = 20;
const DOWNLOAD_TO = 75;

export function updateRoot(): string {
  return join(process.cwd(), ".storage", "update");
}

function stagingDir(version: string): string {
  return join(updateRoot(), `staging-${version.replace(/[^A-Za-z0-9._-]/g, "_")}`);
}

function archivePath(version: string): string {
  return join(updateRoot(), `source-${version.replace(/[^A-Za-z0-9._-]/g, "_")}.tar.gz`);
}

/** 跑一个子进程并收集输出，超时则强制结束。 */
function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeout: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeout);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

async function runBackupStep(jobId: string, enabled: boolean): Promise<void> {
  await patchJob(
    jobId,
    { stage: "BACKUP", progress: 5, message: enabled ? "正在备份数据库与上传文件" : "已跳过备份（APP_UPDATE_SKIP_BACKUP=true）" },
    { level: "info", text: enabled ? "开始备份" : "按配置跳过备份" },
  );
  if (!enabled) return;

  const result = await runCommand(process.execPath, [join(process.cwd(), "scripts", "backup.mjs")], {
    timeout: BACKUP_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    const reason = result.timedOut ? "备份超时" : `备份失败（退出码 ${result.code}）`;
    throw new ApiError(
      500,
      `${reason}。为避免数据风险已中止更新，请先手动执行 pnpm db:backup 确认备份可用`,
      "BACKUP_FAILED",
    );
  }
  await patchJob(jobId, { progress: 20, message: "备份完成" }, { level: "info", text: "备份完成" });
}

/**
 * 下载源码包并逐块写入磁盘，按已接收字节数推进进度。
 * 上游未返回 Content-Length 时无法算百分比，退化为「已下载 N MB」并封顶在区间上限，
 * 不假装知道总量。
 */
async function downloadArchive(jobId: string, repo: string, target: UpstreamRelease, pinnedCommit?: string): Promise<string> {
  const ref = pinnedCommit || target.commit || target.tagName || target.version;
  if (!ref) throw new ApiError(502, "上游版本缺少可下载的引用", "NO_DOWNLOAD_REF");

  // 走 api.github.com 取 tarball：私有仓库在这里带 token 才有效，
  // codeload 的直连地址不接受 Authorization 头。
  const finalUrl = `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(ref)}`;

  await patchJob(
    jobId,
    { stage: "DOWNLOAD", progress: DOWNLOAD_FROM, message: `正在下载 ${target.version}` },
    { level: "info", text: `开始下载版本 ${target.version}（ref=${ref}）` },
  );

  const headers: Record<string, string> = { "User-Agent": "xungen-updater", Accept: "application/vnd.github+json" };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(finalUrl, { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "follow" });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ApiError(504, "下载新版本超时，请检查服务器出网速度", "DOWNLOAD_TIMEOUT");
    }
    throw new ApiError(502, "下载新版本失败：无法连接上游", "DOWNLOAD_NETWORK");
  }

  if (res.status === 404) throw new ApiError(502, "上游未找到该版本的源码包（404）", "DOWNLOAD_NOT_FOUND");
  if (res.status === 403 || res.status === 401) {
    throw new ApiError(502, "下载被上游拒绝，私有仓库请配置 APP_UPDATE_TOKEN", "DOWNLOAD_FORBIDDEN");
  }
  if (!res.ok || !res.body) {
    throw new ApiError(502, `下载新版本失败：上游返回 ${res.status}`, "DOWNLOAD_FAILED");
  }

  const total = Number(res.headers.get("content-length") || 0);
  if (total > MAX_ARCHIVE_BYTES) {
    throw new ApiError(502, `源码包超过 ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)}MB 上限，已中止`, "ARCHIVE_TOO_LARGE");
  }

  await mkdir(updateRoot(), { recursive: true });
  const dest = archivePath(target.version);
  const out = createWriteStream(dest);
  let received = 0;
  let lastReported = -1;

  const source = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_ARCHIVE_BYTES) {
      source.destroy(new Error("archive too large"));
      return;
    }
    if (!total) return;
    const ratio = Math.min(1, received / total);
    const overall = Math.round(DOWNLOAD_FROM + ratio * (DOWNLOAD_TO - DOWNLOAD_FROM));
    // 只在百分比变化时写库，避免每个 chunk 都打一次数据库
    if (overall !== lastReported) {
      lastReported = overall;
      void patchJob(jobId, { progress: overall, message: `正在下载 ${target.version}（${overall}%）` }).catch(() => {
        /* 进度写失败不应中断下载 */
      });
    }
  });

  try {
    await pipeline(source, out);
  } catch (err) {
    await rm(dest, { force: true });
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("archive too large")) {
      throw new ApiError(502, "源码包体积异常，已中止下载", "ARCHIVE_TOO_LARGE");
    }
    throw new ApiError(502, `下载中断：${message}`, "DOWNLOAD_INTERRUPTED");
  }

  const info = await stat(dest);
  if (info.size === 0) {
    await rm(dest, { force: true });
    throw new ApiError(502, "下载到的源码包为空，已中止", "EMPTY_ARCHIVE");
  }
  const sizeMb = (info.size / 1024 / 1024).toFixed(1);
  await patchJob(
    jobId,
    { progress: DOWNLOAD_TO, message: `下载完成（${sizeMb} MB）` },
    { level: "info", text: `源码包已保存，大小 ${sizeMb} MB` },
  );
  return dest;
}

/** 校验并解包到 staging 目录，检查包内 package.json 的版本与目标一致。 */
async function verifyAndExtract(jobId: string, archive: string, target: UpstreamRelease): Promise<string> {
  await patchJob(jobId, { stage: "VERIFY", progress: 78, message: "正在校验并解包发布包" }, { level: "info", text: "校验发布包" });

  const root = resolve(updateRoot());
  const dir = resolve(stagingDir(target.version));
  const stagingRelative = relative(root, dir);
  if (!stagingRelative || stagingRelative.startsWith(`..${sep}`) || stagingRelative === ".." || isAbsolute(stagingRelative)) {
    throw new ApiError(500, "更新暂存路径无效", "INVALID_STAGING_PATH");
  }

  try {
    await inspectTarGz(archive);
  } catch (err) {
    await rm(archive, { force: true });
    throw new ApiError(502, `发布包结构不安全或超出限制：${err instanceof Error ? err.message : String(err)}`, "INVALID_ARCHIVE");
  }

  await mkdir(root, { recursive: true });
  const resolvedRoot = await realpath(root);
  const resolvedParent = await realpath(join(dir, ".."));
  if (resolvedParent !== resolvedRoot) {
    throw new ApiError(500, "更新暂存目录不在安全根目录中", "INVALID_STAGING_PATH");
  }
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  // 归档已流式检查路径、类型和体积后才传给系统 tar 解包。
  const result = await runCommand("tar", ["-xzf", archive, "-C", dir, "--strip-components=1", "--no-same-owner", "--no-same-permissions"], { timeout: 120_000 });
  if (result.code !== 0) {
    await rm(dir, { recursive: true, force: true });
    await rm(archive, { force: true });
    throw new ApiError(502, `解包发布包失败：${result.stderr.slice(0, 300)}`, "EXTRACT_FAILED");
  }

  const pkgPath = join(dir, "package.json");
  let pkgVersion = "";
  try {
    const raw = await readFile(pkgPath, "utf8");
    pkgVersion = String((JSON.parse(raw) as { version?: string }).version ?? "");
  } catch {
    await rm(dir, { recursive: true, force: true });
    throw new ApiError(502, "发布包缺少 package.json，无法校验版本", "INVALID_ARCHIVE");
  }

  const normalizedPkg = pkgVersion.replace(/^v/, "").trim();
  if (target.tagName && normalizedPkg !== target.version) {
    // tag 与包内版本不一致说明发布流程有问题，装上会显示错误版本号，不如直接拒绝
    await rm(dir, { recursive: true, force: true });
    throw new ApiError(
      502,
      `发布包版本（${normalizedPkg || "空"}）与目标版本（${target.version}）不一致，已中止`,
      "VERSION_MISMATCH",
    );
  }

  await patchJob(
    jobId,
    { progress: 85, message: "发布包校验通过" },
    { level: "info", text: `解包完成，包内版本 ${normalizedPkg}` },
  );
  return dir;
}

/**
 * 启动 detached 安装进程。
 * detached + unref 让该进程脱离当前 Web 进程的生命周期：
 * 即使随后应用被重启，安装与构建仍会继续跑完。
 */
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40,64}$/i;

async function resolveTargetCommit(repo: string, target: UpstreamRelease): Promise<string> {
  if (target.commit && COMMIT_SHA_PATTERN.test(target.commit)) return target.commit;
  const ref = target.tagName || target.commit || target.version;
  if (!ref) throw new ApiError(502, "上游目标缺少可解析的 commit 引用", "TARGET_COMMIT_UNAVAILABLE");

  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "xungen-updater" };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(502, "无法解析更新目标的精确 commit SHA", "TARGET_COMMIT_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new ApiError(502, `无法解析更新目标的精确 commit SHA（上游 ${response.status}）`, "TARGET_COMMIT_UNAVAILABLE");
  }

  const payload = (await response.json().catch(() => null)) as { sha?: unknown } | null;
  const sha = typeof payload?.sha === "string" ? payload.sha : "";
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new ApiError(502, "上游未返回有效的精确 commit SHA", "TARGET_COMMIT_UNAVAILABLE");
  }
  return sha;
}

async function writePendingApply(pendingPath: string, data: unknown): Promise<void> {
  const temporaryPath = `${pendingPath}.${process.pid}.tmp`;
  try {
    const file = await open(temporaryPath, "w");
    try {
      await file.writeFile(JSON.stringify(data, null, 2), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, pendingPath);
    if (process.platform !== "win32") {
      const directory = await open(dirname(pendingPath), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } catch (err) {
    await rm(temporaryPath, { force: true });
    throw err;
  }
}

async function spawnApply(jobId: string, staging: string, target: UpstreamRelease, targetCommit: string): Promise<void> {
  const script = join(process.cwd(), "scripts", "update-apply.mjs");
  const pendingPath = join(updateRoot(), "pending-apply.json");
  await mkdir(updateRoot(), { recursive: true });
  await writePendingApply(pendingPath, { jobId, staging, target, targetCommit, startedAt: new Date().toISOString() });

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      process.execPath,
      [script, "--job", jobId, "--staging", staging, "--target", target.version, "--commit", targetCommit, "--parent-pid", String(process.pid)],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
        env: { ...process.env, APP_UPDATE_IN_PROGRESS: "1" },
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  } catch (err) {
    await rm(pendingPath, { force: true });
    throw err;
  }
}

/**
 * 为源码或 Docker 驱动准备一份经过校验的发布包。
 * Docker 驱动也必须经过同样的备份、下载和校验流程，不能只触发一次本地旧源码构建。
 */
export async function prepareUpdateArtifact(jobId: string, repo: string, target: UpstreamRelease, pinnedCommit?: string): Promise<string> {
  // 必须立刻把这个任务置为 RUNNING：备份、下载与校验可能持续数分钟，
  // 若仍停留在 QUEUED，会被 healStaleJobs 的 QUEUED 超时（2 分钟）
  // 误判成「执行器从未启动」而强制失败，并释放更新锁。
  await patchJob(
    jobId,
    { status: "RUNNING", stage: "BACKUP", progress: 2, message: "开始准备更新", startedAt: new Date() },
    { level: "info", text: "开始准备更新" },
  );
  try {
    await runBackupStep(jobId, process.env.APP_UPDATE_SKIP_BACKUP !== "true");
    const archive = await downloadArchive(jobId, repo, target, pinnedCommit);
    try {
      return await verifyAndExtract(jobId, archive, target);
    } finally {
      await rm(archive, { force: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJob(jobId, "FAILED", { message: "更新失败", error: message });
    throw err;
  }
}

export async function runUpdateInApp(jobId: string, repo: string, target: UpstreamRelease): Promise<{ staging: string }> {
  // 同上：解析 commit 与下载都可能超过 QUEUED 超时，先进入 RUNNING。
  await patchJob(
    jobId,
    { status: "RUNNING", stage: "BACKUP", progress: 1, message: "正在解析更新目标", startedAt: new Date() },
    { level: "info", text: "正在解析更新目标的精确 commit" },
  );

  try {
    const targetCommit = await resolveTargetCommit(repo, target);
    const staging = await prepareUpdateArtifact(jobId, repo, target, targetCommit);
    await patchJob(
      jobId,
      { stage: "INSTALL", progress: 86, message: "正在安装并构建新版本（此阶段服务可能短暂不可用）" },
      { level: "info", text: `交由独立安装进程执行覆盖、依赖安装与构建（commit ${targetCommit.slice(0, 12)}）` },
    );
    await spawnApply(jobId, staging, target, targetCommit);
    return { staging };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJob(jobId, "FAILED", { message: "更新失败", error: message });
    throw err;
  }
}

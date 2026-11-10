/**
 * 独立安装进程（detached）。
 *
 * 由应用在下载并解包完成后启动，脱离 Web 进程的生命周期独立运行：
 * 覆盖源码 → 安装依赖 → 生成 Prisma Client → 构建 → 重启。
 * 之所以必须独立：构建会替换 .next，在运行中的进程里构建等于自己踩自己的产物；
 * 而重启本身就是要结束当前进程。
 *
 * 安全设计：
 * 1. 替换受管目录前先整体移到备份目录，构建失败立即回滚，避免留下半个源码树。
 * 2. 只有确认存在进程托管方（APP_UPDATE_RESTART_CMD / 容器 / pm2 / systemd）才自动重启。
 *    否则只安装不重启，并提示手动重启——绝不能把无人托管的服务直接杀掉。
 * 3. 全程写库，即使应用已重启，后台仍能看到构建日志与失败原因。
 *
 * 用法（由应用自动调用，不建议手动执行）：
 *   node scripts/update-apply.mjs --job <uuid> --staging <dir> --target <ver> --commit <sha> --parent-pid <pid>
 */
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import {
  MANAGED_ARTIFACTS,
  MANAGED_DIRS,
  MANAGED_FILES,
  isInsideStagingRoot,
  isProtectedEntry,
  parseArgs,
  selectReplaceable,
  skippedEntries,
  validateArgs,
} from "./update-apply-safety.mjs";

const { Client } = pg;
const ROOT = process.cwd();

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;
const INSTALL_PROGRESS_FROM = 86;

const args = parseArgs(process.argv.slice(2));
const validated = validateArgs(args);
if (!validated.ok) {
  console.error(`[update-apply] 参数校验失败：${validated.error}`);
  console.error("[update-apply] 用法：--job <uuid> --staging <dir> --target <ver> --commit <sha> [--parent-pid <pid>]");
  process.exit(2);
}
const { jobId, staging, targetVersion, targetCommit, parentPid } = validated.value;

const stagingRoot = path.resolve(ROOT, ".storage", "update");
const stagingPath = path.resolve(staging);
if (!isInsideStagingRoot(stagingRoot, stagingPath)) {
  console.error("[update-apply] 暂存路径必须位于 .storage/update 子目录中");
  process.exit(2);
}

// ---------------- 日志与状态持久化 ----------------

let client = null;

async function db() {
  if (client) return client;
  client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  await client.connect();
  return client;
}

async function patchJob(patch, logEntry) {
  try {
    const c = await db();
    const { rows } = await c.query("SELECT log FROM update_jobs WHERE id = $1", [jobId]);
    if (!rows.length) return;
    let log = Array.isArray(rows[0].log) ? rows[0].log : [];
    if (logEntry) log.push({ at: new Date().toISOString(), level: logEntry.level || "info", text: logEntry.text });
    log = log.slice(-200);

    const sets = [];
    const values = [];
    let idx = 1;
    const set = (col, val) => {
      sets.push(`${col} = $${idx}`);
      values.push(val);
      idx += 1;
    };
    if (patch.status !== undefined) set("status", patch.status);
    if (patch.stage !== undefined) set("stage", patch.stage);
    if (patch.progress !== undefined) set("progress", Math.max(0, Math.min(100, Math.round(patch.progress))));
    if (patch.message !== undefined) set("message", String(patch.message).slice(0, 500));
    if (patch.error !== undefined) set("error", patch.error);
    if (patch.finishedAt !== undefined) set("finished_at", patch.finishedAt);
    if (patch.clearLock) set("active_lock", null);
    if (logEntry) set("log", JSON.stringify(log));
    sets.push(`updated_at = now()`);

    values.push(jobId);
    await c.query(`UPDATE update_jobs SET ${sets.join(", ")} WHERE id = $${idx}`, values);
  } catch (err) {
    // 写库失败不能中断更新，但必须留痕到文件
    console.error("[update-apply] 写库失败:", err.message);
    await appendFileLog(`写库失败：${err.message}`);
  }
}

let logFile = path.join(ROOT, ".storage", "update", "apply.log");

async function appendFileLog(text) {
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
    const line = `[${new Date().toISOString()}] ${text}\n`;
    const prev = existsSync(logFile) ? await readFile(logFile, "utf8") : "";
    await writeFile(logFile, (prev + line).slice(-200_000), "utf8");
  } catch {
    /* 忽略 */
  }
}

const note = async (level, text) => {
  console.log(`[update-apply] ${text}`);
  await appendFileLog(`${level.toUpperCase()}: ${text}`);
  await patchJob({}, { level, text });
};

// ---------------- 文件替换 ----------------

async function copyTree(from, to) {
  await cp(from, to, { recursive: true, force: true, errorOnExist: false });
}

async function restoreBackup(prevDir, targets = []) {
  const failures = [];
  for (const name of targets) {
    try {
      await rm(path.join(ROOT, name), { recursive: true, force: true });
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  }

  let entries = [];
  try {
    entries = await readdir(prevDir);
  } catch (err) {
    if (err.code !== "ENOENT") failures.push(`读取备份目录：${err.message}`);
  }
  for (const name of entries) {
    const backup = path.join(prevDir, name);
    const dest = path.join(ROOT, name);
    try {
      await rm(dest, { recursive: true, force: true });
      await rename(backup, dest);
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  }
  if (failures.length) throw new Error(`回滚不完整：${failures.join("；")}`);
  await rm(prevDir, { recursive: true, force: true });
}

async function preserveOriginalEntry(filePath, prevDir) {
  try {
    await lstat(filePath);
    const backup = path.join(prevDir, path.relative(ROOT, filePath));
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(filePath, backup);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function replaceTree() {
  const resolvedStaging = await realpath(staging);
  if (resolvedStaging !== stagingPath || !resolvedStaging.startsWith(`${stagingRoot}${path.sep}`)) {
    throw new Error("暂存目录实际路径不在 .storage/update 子目录中");
  }
  const prevDir = path.join(ROOT, ".storage", "update", `prev-${Date.now()}`);
  await mkdir(prevDir, { recursive: true });
  await mkdir(path.join(ROOT, ".storage", "update"), { recursive: true });

  await note("info", "先备份源码、构建产物与待覆盖文件，再替换源码");

  let entries = [];
  const rollbackTargets = [...MANAGED_DIRS, ...MANAGED_FILES, ...MANAGED_ARTIFACTS];
  const backedUp = new Set();
  let backupComplete = false;
  let applying = false;
  try {
    entries = await readdir(staging);
    const replaceable = selectReplaceable(entries);
    const skipped = skippedEntries(entries);
    if (skipped.length > 0) {
      // 上游带了白名单之外的文件（可能是 .env、备份或构建产物）：明确跳过并留痕
      await note("warn", `跳过 ${skipped.length} 个不在替换白名单中的条目：${skipped.slice(0, 10).join(", ")}${skipped.length > 10 ? " …" : ""}`);
    }
    for (const name of rollbackTargets) {
      if (isProtectedEntry(name) && !MANAGED_ARTIFACTS.includes(name)) {
        throw new Error(`内部错误：受保护条目 ${name} 出现在待替换列表中`);
      }
      if (await preserveOriginalEntry(path.join(ROOT, name), prevDir)) backedUp.add(name);
    }
    backupComplete = true;

    applying = true;
    for (const name of replaceable) {
      if (isProtectedEntry(name)) continue;
      const src = path.join(staging, name);
      const dest = path.join(ROOT, name);
      await copyTree(src, dest);
    }
    await note("info", `已替换 ${replaceable.length} 个顶层条目（上游共 ${entries.length} 个）`);
  } catch (err) {
    await note("error", `替换失败，开始回滚：${err.message}`);
    try {
      await restoreBackup(prevDir, backupComplete && applying ? rollbackTargets : [...backedUp]);
    } catch (rollbackErr) {
      throw new Error(`${err.message}；${rollbackErr.message}`);
    }
    throw err;
  }

  return { prevDir, rollbackTargets };
}

// ---------------- 命令执行 ----------------

function run(command, cmdArgs, timeout, env = {}) {
  note("info", `执行：${command} ${cmdArgs.join(" ")}`);
  const result = spawnSync(command, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout,
    env: { ...process.env, CI: "true", NEXT_TELEMETRY_DISABLED: "1", ...env },
  });
  const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return { code: result.status ?? -1, out };
}

// ---------------- 重启能力判定 ----------------

function detectRestart() {
  const cmd = (process.env.APP_UPDATE_RESTART_CMD || "").trim();
  if (cmd) return { ok: true, how: "command", detail: cmd };
  if (existsSync("/.dockerenv")) {
    return { ok: true, how: "docker", detail: "容器 restart:unless-stopped 会拉起新容器" };
  }
  if (process.env.PM2_HOME || process.env.pm_id) return { ok: true, how: "pm2", detail: "pm2" };
  if (process.env.INVOCATION_ID) return { ok: true, how: "systemd", detail: "systemd" };
  return { ok: false, how: "none", detail: "未检测到进程托管方" };
}

async function restart(restartInfo) {
  await patchJob({ stage: "RESTART", progress: 98, message: "正在重启服务" });
  await note("info", `重启方式：${restartInfo.how}（${restartInfo.detail}）`);

  if (restartInfo.how === "command") {
    const [bin, ...rest] = restartInfo.detail.split(/\s+/);
    const r = run(bin, rest, 120_000);
    if (r.code !== 0) {
      throw new Error(`重启命令执行失败（退出码 ${r.code}）：${r.out.slice(0, 500)}`);
    }
    return;
  }

  if (parentPid && restartInfo.how !== "docker") {
    // 通知旧进程退出，由进程管理器拉起新进程
    await note("info", `向应用进程 ${parentPid} 发送 SIGTERM`);
    try {
      process.kill(parentPid, "SIGTERM");
    } catch (err) {
      await note("warn", `发送信号失败（进程可能已退出）：${err.message}`);
      return;
    }
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        process.kill(parentPid, 0);
      } catch {
        await note("info", "应用进程已退出");
        return;
      }
    }
    await note("warn", "应用进程未在 30 秒内退出，发送 SIGKILL");
    try {
      process.kill(parentPid, "SIGKILL");
    } catch {
      /* 已退出 */
    }
  }
  // docker 场景不需要 kill：新容器由 compose 重建后替换旧容器
}

// ---------------- 主流程 ----------------

async function main() {
  logFile = path.join(ROOT, ".storage", "update", "apply.log");
  await mkdir(path.join(ROOT, ".storage", "update"), { recursive: true });

  await patchJob({ status: "RUNNING", stage: "INSTALL", progress: INSTALL_PROGRESS_FROM, message: `正在安装 ${targetVersion}` });
  await note("info", `开始安装 ${targetVersion}，staging=${staging}`);

  const prevPkgRaw = await readFile(path.join(ROOT, "package.json"), "utf8").catch(() => "{}");
  let prevVersion = "unknown";
  try {
    prevVersion = JSON.parse(prevPkgRaw).version || "unknown";
  } catch {
    await note("warn", "无法解析更新前 package.json 版本，记录为 unknown");
  }

  let prevDir = null;
  let rollbackTargets = [];
  let buildSucceeded = false;
  try {
    ({ prevDir, rollbackTargets } = await replaceTree());

    await patchJob({ progress: 88, message: "正在安装依赖" });
    const install = run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], INSTALL_TIMEOUT_MS);
    if (install.code !== 0) {
      throw new Error(`依赖安装失败（退出码 ${install.code}）：${install.out.slice(-1500)}`);
    }
    await note("info", "依赖安装完成");

    await patchJob({ progress: 91, message: "正在生成数据库客户端" });
    const gen = run("pnpm", ["exec", "prisma", "generate"], INSTALL_TIMEOUT_MS);
    if (gen.code !== 0) {
      throw new Error(`prisma generate 失败：${gen.out.slice(-1500)}`);
    }

    await patchJob({ progress: 93, message: "正在构建（约 1-3 分钟，期间服务可能不稳定）" });
    const build = run("pnpm", ["build"], INSTALL_TIMEOUT_MS, {
      APP_BUILD_SHA: targetCommit,
      APP_VERSION: targetVersion,
      APP_BUILD_TIME: new Date().toISOString(),
    });
    if (build.code !== 0) {
      throw new Error(`构建失败（退出码 ${build.code}）：${build.out.slice(-2000)}`);
    }
    buildSucceeded = true;
    await note("info", "构建完成；旧源码、依赖和构建产物备份已保留，供重启失败时人工恢复");

    // 记录安装结果，供重启后自愈逻辑与运维排查使用
    await writeFile(
      path.join(ROOT, ".storage", "update", "last-apply.json"),
      JSON.stringify(
        {
          jobId,
          fromVersion: prevVersion,
          targetVersion,
          targetCommit,
          installedAt: new Date().toISOString(),
          rollbackBackup: prevDir,
          restart: detectRestart(),
        },
        null,
        2,
      ),
      "utf8",
    );

    const restartInfo = detectRestart();
    if (!restartInfo.ok) {
      // 无人托管时绝不自杀：装好即可，重启交给运维
      await patchJob({
        status: "SUCCEEDED",
        stage: "DONE",
        progress: 100,
        message: "新版本已安装，但未检测到进程托管方，请手动重启服务使其生效",
        finishedAt: new Date(),
        clearLock: true,
      });
      await note("warn", "未检测到进程托管方，已跳过自动重启。请手动执行重启（如 pnpm start 或 systemctl restart）");
      return;
    }

    await restart(restartInfo);

    // docker 场景下旧容器即将被替换，这里先把状态置为重启中；
    // 新容器启动后由 healStaleJobs 依据版本是否生效收尾为成功。
    await patchJob({ stage: "RESTART", progress: 99, message: "服务重启中，稍后自动确认结果" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await note("error", message);
    let rollbackSucceeded = false;
    if (prevDir && !buildSucceeded) {
      try {
        await restoreBackup(prevDir, rollbackTargets);
        rollbackSucceeded = true;
        await note("warn", "已回滚到更新前的源码、依赖与构建产物");
      } catch (rollbackErr) {
        await note("error", `回滚不完整，需要人工检查备份目录 ${prevDir}：${rollbackErr.message}`);
      }
    } else if (prevDir) {
      await note("warn", `构建已完成，未自动回滚；更新前备份保留在 ${prevDir}`);
    }
    await patchJob({
      status: "FAILED",
      progress: 100,
      message: buildSucceeded
        ? "构建已完成，但重启或收尾失败；更新前备份已保留"
        : rollbackSucceeded
          ? "更新失败，已回滚到更新前状态"
          : "更新失败，回滚未能完整确认",
      error: message.slice(0, 2000),
      finishedAt: new Date(),
      clearLock: true,
    });
    process.exit(1);
  }
}

main()
  .then(() => {
    client?.end().catch(() => {});
  })
  .catch(async (err) => {
    console.error("[update-apply] 未捕获异常:", err);
    await appendFileLog(`未捕获异常：${err?.message || err}`);
    client?.end().catch(() => {});
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * 更新安装脚本的纯逻辑部分。
 *
 * 单独成文件的原因：`update-apply.mjs` 是顶层立即执行的 detached 脚本
 * （解析 argv、连数据库、替换文件、重启进程），无法被单元测试安全 import。
 * 而它里面「哪些顶层条目允许被替换」「暂存路径是否越界」「参数是否合法」
 * 恰恰是最需要回归保护的安全边界，因此抽到这里，由
 * `src/tests/update-apply-safety.test.ts` 直接覆盖。
 *
 * 本文件不执行任何副作用、不读环境变量之外的全局状态，只做判断与计算。
 */

/** 受管目录：整体替换，使上游删除的文件不会残留在本地 */
export const MANAGED_DIRS = Object.freeze([
  "src", "prisma", "scripts", "public", "docs", "e2e", "docker", "nginx",
]);

/** 受管顶层文件：仅更新应用构建与运行所需的项目文件 */
export const MANAGED_FILES = Object.freeze([
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc",
  "next.config.ts", "tsconfig.json", "postcss.config.mjs", "eslint.config.mjs", "playwright.config.ts",
]);

/** 构建产物与依赖：整体备份后可被重新生成，不属于源码 */
export const MANAGED_ARTIFACTS = Object.freeze(["node_modules", ".next"]);

/** 允许被替换的全部顶层条目（源码 + 文件 + 产物） */
export const REPLACEABLE_ENTRIES = Object.freeze([
  ...MANAGED_DIRS, ...MANAGED_FILES, ...MANAGED_ARTIFACTS,
]);

export const COMMIT_SHA_PATTERN = /^[a-f0-9]{40,64}$/i;

/**
 * 明确禁止被覆盖的条目。
 *
 * 这些路径要么是运维数据（备份、上传、密钥），要么是更新器自身的运行状态。
 * 上游即使意外包含了同名文件也绝不替换——否则一次更新就能把数据库备份、
 * 用户上传的档案或 .env 里的密钥抹掉。
 */
export const PROTECTED_ENTRIES = Object.freeze([
  ".env",
  ".env.local",
  ".git",
  ".storage",
  "backups",
  ".pgdata",
  ".autonomous-upgrade",
  "node_modules",   // 由 pnpm install 生成，不由上游 tar 直接覆盖
  ".next",          // 由 pnpm build 生成
]);

/**
 * 从 --key value 形式的 argv 解析参数。
 * 没有值的 `--flag` 会被记为 true，便于将来加布尔开关。
 */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key.slice(2)] = true;
      continue;
    }
    out[key.slice(2)] = next;
    i += 1;
  }
  return out;
}

/**
 * 校验安装参数。
 * @returns {{ ok: true, value: { jobId: string, staging: string, targetVersion: string, targetCommit: string, parentPid: number } } | { ok: false, error: string }}
 */
export function validateArgs(args) {
  const jobId = typeof args.job === "string" ? args.job.trim() : "";
  const staging = typeof args.staging === "string" ? args.staging.trim() : "";
  const targetVersion = typeof args.target === "string" ? args.target.trim() : "";
  const targetCommit = typeof args.commit === "string" ? args.commit.trim() : "";
  const parentPidRaw = args["parent-pid"];

  if (!jobId) return { ok: false, error: "缺少 --job" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return { ok: false, error: "任务 ID 不是合法的 UUID" };
  }
  if (!staging) return { ok: false, error: "缺少 --staging" };
  if (!targetVersion) return { ok: false, error: "缺少 --target" };
  if (!targetCommit) return { ok: false, error: "缺少 --commit" };
  if (!COMMIT_SHA_PATTERN.test(targetCommit)) {
    return { ok: false, error: "commit SHA 必须是 40–64 位十六进制" };
  }

  let parentPid = 0;
  if (parentPidRaw !== undefined) {
    const parsed = Number(parentPidRaw);
    if (!Number.isInteger(parsed) || parsed < 0) return { ok: false, error: "parent-pid 必须是非负整数" };
    parentPid = parsed;
  }

  return { ok: true, value: { jobId, staging, targetVersion, targetCommit, parentPid } };
}

/**
 * 判断暂存目录是否严格位于 `<root>/.storage/update` 的子目录中。
 *
 * 两层防护：既要求 path.relative 的结果不是空、不是 `..`，也要求解析后的
 * 绝对路径以根目录 + 分隔符开头。后者是关键——`relative` 在大小写不敏感
 * 的文件系统（Windows/macOS 默认）上不区分大小写，而 `startsWith` 也不区分，
 * 所以额外用 `resolve` 后的字符串比较来堵住 `..` 逃逸。
 */
export function isInsideStagingRoot(stagingRoot, candidate) {
  if (typeof stagingRoot !== "string" || typeof candidate !== "string") return false;
  if (!stagingRoot || !candidate) return false;
  const root = pathResolve(stagingRoot);
  const target = pathResolve(candidate);
  const rel = pathRelative(root, target);
  if (!rel || rel === ".") return false;
  if (rel === ".." || rel.startsWith(`..${sep()}`)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

/**
 * 决定哪些顶层条目应当被替换。
 * 只接受 MANAGED_DIRS / MANAGED_FILES 中的名字，其余（含产物目录）一律跳过。
 */
export function selectReplaceable(entries) {
  const allowed = new Set([...MANAGED_DIRS, ...MANAGED_FILES]);
  return [...new Set(entries)].filter((name) => allowed.has(name));
}

/** 报告哪些上游条目因为不在白名单而被跳过，供日志提示。 */
export function skippedEntries(entries) {
  const allowed = new Set([...MANAGED_DIRS, ...MANAGED_FILES]);
  return [...new Set(entries)].filter((name) => !allowed.has(name));
}

/**
 * 守卫：受保护条目永远不能被「备份后替换」流程触碰。
 * 供 replaceTree 在动文件前做最终断言。
 */
export function isProtectedEntry(name) {
  return PROTECTED_ENTRIES.includes(name);
}

// 用函数包装 path 依赖，避免在模块顶层引入 node:path 之外的状态
import pathModule from "node:path";
function pathResolve(...parts) {
  return pathModule.resolve(...parts);
}
function pathRelative(from, to) {
  return pathModule.relative(from, to);
}
function sep() {
  return pathModule.sep;
}
function isAbsolute(p) {
  return pathModule.isAbsolute(p);
}

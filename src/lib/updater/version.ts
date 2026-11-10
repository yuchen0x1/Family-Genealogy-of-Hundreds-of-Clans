/**
 * 版本标识与比较。
 *
 * 「有没有新版本」必须先有一个可信的版本标识，否则只能退化成比对 commit SHA，
 * 而 SHA 无法向使用者解释「更新了什么」。本模块统一两件事：
 *   1. 当前运行的版本（package.json + 构建注入的 commit SHA）
 *   2. 版本字符串的严格比较（不依赖 semver 库，避免为一个函数引入依赖）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LocalVersion = {
  version: string;
  commit: string;
  buildTime: string | null;
  /** 版本来源，便于排查「为什么显示的版本不对」 */
  source: "package.json" | "env" | "unknown";
};

/** 归一化版本号：去掉前缀 v、去掉构建元数据（+xxx），保留预发布标记。 */
export function normalizeVersion(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(/^[vV]/, "");
  return withoutPrefix.split("+")[0].trim();
}

type ParsedVersion = {
  core: [number, number, number];
  pre: string[];
};

function parseVersion(raw: string): ParsedVersion | null {
  const value = String(raw ?? "").trim();
  const match = value.match(/^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) return null;

  const coreParts = match.slice(1, 4).filter((part): part is string => part !== undefined);
  const core: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < coreParts.length; i += 1) {
    const part = coreParts[i];
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (!Number.isSafeInteger(n)) return null;
    core[i] = n;
  }

  const pre = match[4] ? match[4].split(".") : [];
  if (pre.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  return { core, pre };
}

/**
 * 比较两个版本。
 * 返回 1 表示 a 更新、-1 表示 a 更旧、0 表示相同。
 * 无法解析的版本一律视为「更旧」，避免脏 tag 让界面误报可更新。
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] > pb.core[i] ? 1 : -1;
  }

  // 语义化版本规则：正式版 > 同号预发布版（1.0.0 > 1.0.0-rc.1）
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const sa = pa.pre[i];
    const sb = pb.pre[i];
    if (sa === undefined) return -1;
    if (sb === undefined) return 1;
    if (sa === sb) continue;
    const na = Number(sa);
    const nb = Number(sb);
    const aIsNum = Number.isFinite(na) && String(na) === sa;
    const bIsNum = Number.isFinite(nb) && String(nb) === sb;
    if (aIsNum && bIsNum) return na > nb ? 1 : -1;
    if (aIsNum) return -1; // 数字标识优先级低于字母标识
    if (bIsNum) return 1;
    return sa > sb ? 1 : -1;
  }
  return 0;
}

export function isValidVersion(raw: string): boolean {
  return parseVersion(raw) !== null;
}

let cachedLocal: LocalVersion | null = null;

/**
 * 读取当前运行版本。
 *
 * 源码部署时 package.json 与实际代码一致；容器镜像里 .git 不存在，
 * 因此 commit 依赖构建期注入的 APP_BUILD_SHA（见 next.config.ts 与 Dockerfile）。
 */
export function readLocalVersion(): LocalVersion {
  if (cachedLocal) return cachedLocal;

  let version = "";
  let source: LocalVersion["source"] = "unknown";
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (parsed.version) {
      version = normalizeVersion(parsed.version);
      source = "package.json";
    }
  } catch {
    // 读取失败不抛错：版本展示是辅助信息，不能阻断后台页面
  }
  if (!version && process.env.APP_VERSION) {
    version = normalizeVersion(process.env.APP_VERSION);
    source = "env";
  }

  const commit = (process.env.APP_BUILD_SHA || "").slice(0, 40) || "unknown";
  const buildTime = process.env.APP_BUILD_TIME || null;

  cachedLocal = {
    version: version || "0.0.0",
    commit,
    buildTime,
    source,
  };
  return cachedLocal;
}

/** 仅供测试：清空进程内缓存。 */
export function __resetLocalVersionCache() {
  cachedLocal = null;
}

/** 短 commit，用于界面展示。 */
export function shortCommit(commit: string): string {
  if (!commit || commit === "unknown") return "unknown";
  return commit.slice(0, 7);
}

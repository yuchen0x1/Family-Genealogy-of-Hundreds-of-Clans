#!/usr/bin/env node
/**
 * 安全发布脚本：更新 package 版本、生成 CHANGELOG，并创建本地提交与 tag。
 *
 * 用法：pnpm release patch|minor|major|<x.y.z>
 * 选项：--dry-run、--allow-dirty、--no-commit、--no-tag
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(root, "package.json");
const changelogPath = resolve(root, "CHANGELOG.md");

function usage() {
  console.log("用法：pnpm release patch|minor|major|<x.y.z> [--dry-run] [--allow-dirty] [--no-commit] [--no-tag]");
}

function fail(message) {
  console.error(`发布失败：${message}`);
  process.exitCode = 1;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || "").trim();
    throw new Error(`${command} ${args.join(" ")} 失败${details ? `：${details}` : ""}`);
  }
  return String(result.stdout || "").trim();
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim());
  if (!match) return null;
  return match.slice(1).map(Number);
}

function versionText(parts) {
  return parts.join(".");
}

function nextVersion(current, requested) {
  const parsed = parseVersion(current);
  if (!parsed) throw new Error(`package.json 中的版本号无效：${current}`);
  if (["major", "minor", "patch"].includes(requested)) {
    const [major, minor, patch] = parsed;
    if (requested === "major") return `${major + 1}.0.0`;
    if (requested === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }
  const explicit = parseVersion(requested);
  if (!explicit) throw new Error(`版本号必须是 patch、minor、major 或 x.y.z：${requested}`);
  const currentNumber = parsed[0] * 1_000_000 + parsed[1] * 1_000 + parsed[2];
  const nextNumber = explicit[0] * 1_000_000 + explicit[1] * 1_000 + explicit[2];
  if (nextNumber <= currentNumber) throw new Error(`新版本 ${versionText(explicit)} 必须高于当前版本 ${current}`);
  return versionText(explicit);
}

function gitStatus() {
  return run("git", ["status", "--porcelain"]);
}

function previousTag() {
  const tags = run("git", ["tag", "--list", "v*", "--sort=-version:refname"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags[0] || null;
}

function commitSummaries(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const output = run("git", ["log", range, "--format=%s"]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^chore\(release\):\s*v?\d+\.\d+\.\d+$/i.test(line));
}

function updatePackageVersion(raw, oldVersion, newVersion) {
  const pattern = new RegExp(`(^\\s*"version"\\s*:\\s*)"${oldVersion.replaceAll(".", "\\.")}"`, "m");
  if (!pattern.test(raw)) throw new Error("无法在 package.json 中定位顶层 version 字段");
  return raw.replace(pattern, `$1"${newVersion}"`);
}

/**
 * 把新版本段落写进 CHANGELOG，并清空 [Unreleased] 的正文。
 *
 * 旧实现有两个问题：`/^## \\[Unreleased\\]/` 被双重转义，实际匹配的是字面
 * 反斜杠，永远不命中，于是每次发布都会追加一个新的 `## [Unreleased]`；
 * 手工写在 Unreleased 下的条目也永远不会进入已发布段。
 * 现在的行为：发布段的正文 = Unreleased 里已有的条目（人工整理的内容优先）
 * + 自上个 tag 以来的 commit 摘要；随后把 Unreleased 正文重置为占位说明。
 */
const UNRELEASED_PLACEHOLDER = "记录尚未发布的功能、修复与维护性更新。";

function updateChangelog(raw, version, summaries, date) {
  if (new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m").test(raw)) {
    throw new Error(`CHANGELOG.md 已存在 ${version} 条目`);
  }

  const unreleasedHeading = /^## \[Unreleased\][^\n]*$/m.exec(raw);
  let head = raw;
  let pendingBody = "";
  let tail = "";
  if (unreleasedHeading) {
    head = raw.slice(0, unreleasedHeading.index);
    const bodyStart = unreleasedHeading.index + unreleasedHeading[0].length;
    const nextHeading = raw.slice(bodyStart).search(/^## /m);
    const bodyEnd = nextHeading < 0 ? raw.length : bodyStart + nextHeading;
    pendingBody = raw.slice(bodyStart, bodyEnd);
    tail = raw.slice(bodyEnd).replace(/^\n+/, "");
  }

  // 人工整理的内容去掉小标题后仍然保留；无实质内容时回退到 commit 摘要
  const curated = pendingBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    // 占位说明不是真实变更，不能带进发布段（旧版本可能残留无前缀的写法）
    .filter((line) => line !== UNRELEASED_PLACEHOLDER && line !== `- ${UNRELEASED_PLACEHOLDER}`);
  const generated = summaries.map((line) => `- ${line}`);
  const entries = [...curated, ...generated];
  const body = entries.length > 0 ? entries.join("\n") : "- 维护性更新";

  const section = `## [${version}] - ${date}\n\n### 变更\n${body}\n\n`;
  const unreleased = `## [Unreleased]\n\n${UNRELEASED_PLACEHOLDER}\n\n`;

  if (!unreleasedHeading) {
    const titleEnd = raw.indexOf("\n");
    if (titleEnd >= 0 && raw.startsWith("# ")) {
      return `${raw.slice(0, titleEnd + 1)}\n${unreleased}${section}${raw.slice(titleEnd + 1)}`;
    }
    return `# Changelog\n\n${unreleased}${section}${raw}`;
  }

  return `${head}${unreleased}${section}${tail}`;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.length === 0) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const dryRun = args.includes("--dry-run");
const allowDirty = args.includes("--allow-dirty");
const noCommit = args.includes("--no-commit");
const noTag = args.includes("--no-tag");
const requested = args.find((arg) => !arg.startsWith("--"));

try {
  if (!requested) throw new Error("缺少目标版本");
  if (!allowDirty && gitStatus()) {
    throw new Error("工作区不干净；请先提交现有改动，或明确使用 --allow-dirty");
  }

  const packageRaw = await readFile(packagePath, "utf8");
  const packageJson = JSON.parse(packageRaw);
  const oldVersion = String(packageJson.version || "");
  const newVersion = nextVersion(oldVersion, requested);
  const tag = `v${newVersion}`;
  const oldTag = previousTag();
  const summaries = commitSummaries(oldTag);
  const date = new Date().toISOString().slice(0, 10);
  const nextPackage = updatePackageVersion(packageRaw, oldVersion, newVersion);
  const changelogRaw = await readFile(changelogPath, "utf8").catch(() => "# Changelog\n\n## [Unreleased]\n\n");
  const nextChangelog = updateChangelog(changelogRaw, newVersion, summaries, date);

  console.log(`发布 ${oldVersion} -> ${newVersion}`);
  console.log(`变更条目：${summaries.length} 条；目标 tag：${tag}`);
  if (dryRun) process.exit(0);

  await writeFile(packagePath, nextPackage);
  await writeFile(changelogPath, nextChangelog);
  if (!noCommit) {
    run("git", ["add", "package.json", "CHANGELOG.md"], { capture: false });
    run("git", ["commit", "-m", `chore(release): ${tag}`], { capture: false });
  }
  if (!noTag) {
    run("git", ["tag", "-a", tag, "-m", `Release ${tag}`], { capture: false });
  }
  console.log(`发布准备完成：${tag}${noCommit ? "（未提交）" : "（已提交）"}${noTag ? "（未打 tag）" : "（已打 tag）"}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

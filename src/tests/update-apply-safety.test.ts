import { describe, expect, it } from "vitest";
import path from "node:path";
// The implementation is intentionally a side-effect-free .mjs utility used by
// the detached updater process; keep its runtime import while avoiding a second
// declaration surface that can drift from the source module.
import {
  COMMIT_SHA_PATTERN,
  MANAGED_DIRS,
  MANAGED_FILES,
  PROTECTED_ENTRIES,
  REPLACEABLE_ENTRIES,
  isInsideStagingRoot,
  isProtectedEntry,
  parseArgs,
  selectReplaceable,
  skippedEntries,
  validateArgs,
} from "../../scripts/update-apply-safety.mjs";

const STAGING_ROOT = path.resolve("/app/.storage/update");
const SHA = "abcdef1234567890abcdef1234567890abcdef12";
const JOB = "11111111-1111-4111-8111-111111111111";

function args(overrides = {}) {
  return { job: JOB, staging: path.join(STAGING_ROOT, "staging-1.2.3"), target: "1.2.3", commit: SHA, ...overrides };
}

/**
 * validateArgs 返回判别联合；断言之后用这两个窄化包装，
 * 避免在每个用例里重复写 if 判断，同时保持类型安全。
 */
function expectOk(result: ReturnType<typeof validateArgs>) {
  if (!result.ok) throw new Error(`期望校验通过，实际失败：${result.error}`);
  return result.value;
}

function expectFail(result: ReturnType<typeof validateArgs>) {
  if (result.ok) throw new Error("期望校验失败，实际通过");
  return result.error;
}

describe("更新安装脚本的参数校验", () => {
  it("解析 --key value 与无值 --flag", () => {
    expect(parseArgs(["--job", "abc", "--dry-run", "--target", "1.0.0"]))
      .toEqual({ job: "abc", "dry-run": true, target: "1.0.0" });
    // 位置参数被忽略
    expect(parseArgs(["stray", "--a", "1"])).toEqual({ a: "1" });
  });

  it("接受合法参数并归一化空白", () => {
    const value = expectOk(validateArgs(args({ job: ` ${JOB} ` })));
    expect(value).toMatchObject({ jobId: JOB, targetCommit: SHA, parentPid: 0 });
  });

  it("拒绝缺失参数与非法 UUID", () => {
    for (const [key, message] of [
      ["job", "缺少 --job"],
      ["staging", "缺少 --staging"],
      ["target", "缺少 --target"],
      ["commit", "缺少 --commit"],
    ]) {
      expect(expectFail(validateArgs(args({ [key]: "" }))), key).toBe(message);
    }
    expect(expectFail(validateArgs(args({ job: "not-a-uuid" })))).toContain("UUID");
  });

  it("拒绝非 40–64 位的 commit SHA", () => {
    for (const bad of ["abc", SHA.slice(0, 39), `${SHA}g`, ""]) {
      expect(() => expectOk(validateArgs(args({ commit: bad }))), bad).toThrow();
    }
    // 64 位（SHA-256 风格）也应接受
    expect(expectOk(validateArgs(args({ commit: "a".repeat(64) }))).targetCommit).toHaveLength(64);
  });

  it("拒绝负数或非整数的 parent-pid", () => {
    expect(expectFail(validateArgs(args({ "parent-pid": "-1" })))).toContain("非负整数");
    expect(() => expectOk(validateArgs(args({ "parent-pid": "1.5" })))).toThrow();
    expect(expectOk(validateArgs(args({ "parent-pid": "1234" }))).parentPid).toBe(1234);
  });
});

describe("更新安装脚本的路径守卫", () => {
  it("接受 stagingRoot 下的直接子目录与更深层级", () => {
    expect(isInsideStagingRoot(STAGING_ROOT, path.join(STAGING_ROOT, "staging-1.0.0"))).toBe(true);
    expect(isInsideStagingRoot(STAGING_ROOT, path.join(STAGING_ROOT, "a", "b"))).toBe(true);
  });

  it("拒绝根目录自身与空字符串", () => {
    expect(isInsideStagingRoot(STAGING_ROOT, STAGING_ROOT)).toBe(false);
    expect(isInsideStagingRoot(STAGING_ROOT, "")).toBe(false);
  });

  it("拒绝用 .. 跳出 staging 根目录", () => {
    expect(isInsideStagingRoot(STAGING_ROOT, path.join(STAGING_ROOT, ".."))).toBe(false);
    expect(isInsideStagingRoot(STAGING_ROOT, path.join(STAGING_ROOT, "..", "staging-x"))).toBe(false);
    expect(isInsideStagingRoot(STAGING_ROOT, path.join(STAGING_ROOT, "a", "..", "..", "staging-x"))).toBe(false);
  });

  it("拒绝绝对路径与项目根目录（更新源码的致命误操作）", () => {
    expect(isInsideStagingRoot(STAGING_ROOT, "/etc/passwd")).toBe(false);
    expect(isInsideStagingRoot(STAGING_ROOT, path.resolve("/app"))).toBe(false);
  });

  it("拒绝形似但不相邻的前缀（/app/.storage/update-evil）", () => {
    expect(isInsideStagingRoot(STAGING_ROOT, `${STAGING_ROOT}-evil/staging-1`)).toBe(false);
  });
});

describe("更新安装脚本的替换白名单", () => {
  it("只替换受管源码目录与受管顶层文件", () => {
    const entries = ["src", "prisma", "package.json", "next.config.ts"];
    expect(selectReplaceable(entries)).toEqual(entries);
  });

  it("跳过上游带进来的危险条目与运行期数据", () => {
    const entries = ["src", ".env", ".git", "backups", ".storage", ".pgdata", "update-apply.mjs", "..", "src"];
    expect(skippedEntries(entries)).toEqual([
      ".env", ".git", "backups", ".storage", ".pgdata", "update-apply.mjs", "..",
    ]);
  });

  it("去重且保持首次出现的顺序", () => {
    expect(selectReplaceable(["src", "prisma", "src", "package.json"])).toEqual(["src", "prisma", "package.json"]);
  });

  it("构建产物不在源码替换白名单里（由 pnpm install/build 重新生成）", () => {
    expect(selectReplaceable(["node_modules", ".next"])).toEqual([]);
    expect(REPLACEABLE_ENTRIES).toContain("node_modules");
    expect(REPLACEABLE_ENTRIES).toContain(".next");
  });

  it("受保护条目覆盖密钥、备份、上传与本地数据", () => {
    for (const name of [".env", ".git", ".storage", "backups", ".pgdata"]) {
      expect(isProtectedEntry(name), name).toBe(true);
    }
    for (const name of ["src", "package.json", "docs"]) {
      expect(isProtectedEntry(name), name).toBe(false);
    }
  });

  it("受管目录与受管文件没有重叠，且都不属于受保护条目", () => {
    const overlap = MANAGED_DIRS.filter((d: string) => MANAGED_FILES.includes(d));
    expect(overlap).toEqual([]);
    const protectedClash = [...MANAGED_DIRS, ...MANAGED_FILES].filter((n) => PROTECTED_ENTRIES.includes(n));
    // node_modules / .next 只出现在 ARTIFACTS 中，受保护列表有意包含它们但不属于源码白名单
    expect(protectedClash).toEqual([]);
  });

  it("commit SHA 正则不接受短 SHA 与非法字符", () => {
    expect(COMMIT_SHA_PATTERN.test(SHA)).toBe(true);
    expect(COMMIT_SHA_PATTERN.test(SHA.slice(0, 12))).toBe(false);
    expect(COMMIT_SHA_PATTERN.test("z".repeat(40))).toBe(false);
  });
});

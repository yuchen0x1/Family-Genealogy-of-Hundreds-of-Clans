import { describe, expect, it } from "vitest";
import { dismissKey, noticeTarget, UPDATE_DISMISS_PREFIX } from "@/lib/update-notice";
import type { UpdateState } from "@/lib/updater";

/** 只关心提示判定用到的字段，其余字段用最小占位，避免测试被无关结构绑死 */
function state(overrides: {
  updateAvailable?: boolean;
  version?: string;
  currentVersion?: string;
  upstream?: boolean;
}): UpdateState {
  return {
    current: { version: overrides.currentVersion ?? "0.2.0", commit: "unknown", buildTime: null, source: "package.json" },
    pairing: {
      instanceId: "xungen-test",
      instanceName: "测试实例",
      repo: "owner/repo",
      channel: "stable",
      branch: "main",
      driver: "SOURCE",
      repoFromEnv: false,
    },
    upstream:
      overrides.upstream === false
        ? null
        : {
            version: overrides.version ?? "0.3.0",
            tagName: `v${overrides.version ?? "0.3.0"}`,
            commit: "a".repeat(40),
            publishedAt: null,
            notes: "更新说明",
            url: null,
            source: "release",
            asset: null,
            mandatory: false,
            securityFix: false,
            minSupportedVersion: null,
          },
    upstreamError: null,
    updateAvailable: overrides.updateAvailable ?? true,
    undeterminedReason: null,
    simulateAllowed: false,
    backupRequired: true,
    activeJob: null,
    latestJob: null,
  };
}

describe("更新提示判定", () => {
  it("有新版本时返回目标版本与当前版本", () => {
    expect(noticeTarget(state({}))).toEqual({ version: "0.3.0", current: "0.2.0" });
  });

  it("已是最新时不提示", () => {
    expect(noticeTarget(state({ updateAvailable: false }))).toBeNull();
  });

  it("上游检查失败（拿不到上游信息）时不提示", () => {
    expect(noticeTarget(state({ upstream: false }))).toBeNull();
  });

  it("状态还没加载出来时不提示", () => {
    expect(noticeTarget(null)).toBeNull();
    expect(noticeTarget(undefined)).toBeNull();
  });

  it("上游版本为空时不提示，避免出现「发现新版本」却给不出版本号", () => {
    expect(noticeTarget(state({ version: "   " }))).toBeNull();
  });

  it("版本号两端空白会被去掉", () => {
    expect(noticeTarget(state({ version: " 0.3.0 " }))?.version).toBe("0.3.0");
  });
});

describe("关闭状态按版本记忆", () => {
  it("键名带版本，不同版本互不影响", () => {
    expect(dismissKey("0.3.0")).toBe(`${UPDATE_DISMISS_PREFIX}.0.3.0`);
    expect(dismissKey("0.3.0")).not.toBe(dismissKey("0.3.1"));
  });

  it("branch 通道的 commit 前缀也能作为键", () => {
    expect(dismissKey("8780a7f12345")).toBe(`${UPDATE_DISMISS_PREFIX}.8780a7f12345`);
  });
});

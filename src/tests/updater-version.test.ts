import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetLocalVersionCache,
  compareVersions,
  isValidVersion,
  normalizeVersion,
  readLocalVersion,
  shortCommit,
} from "@/lib/updater/version";

/** 断言「读的是 package.json」，而不是断言某一个具体版本号——否则每次发版都要改测试 */
const PACKAGE_VERSION = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version as string;

const originalEnv = {
  APP_VERSION: process.env.APP_VERSION,
  APP_BUILD_SHA: process.env.APP_BUILD_SHA,
  APP_BUILD_TIME: process.env.APP_BUILD_TIME,
};

afterEach(() => {
  __resetLocalVersionCache();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("更新器版本归一化与比较", () => {
  it("去除 v 前缀、构建元数据和首尾空白", () => {
    expect(normalizeVersion("  v1.2.3+build.42  ")).toBe("1.2.3");
    expect(normalizeVersion("V2.0.0-rc.1")).toBe("2.0.0-rc.1");
    expect(normalizeVersion(" ")).toBe("");
  });

  it("按核心版本比较，并把正式版排在预发布版之后", () => {
    expect(compareVersions("1.10.0", "1.9.99")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("v2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-1")).toBe(1);
  });

  it("严格校验版本格式，拒绝前导零和非法预发布标识", () => {
    for (const version of ["1.2.3.4", "1.foo.0", "1..2", ".1.2", "1.2-", "01.2.3", "1.02.3", "1.2.3-01", "1.2.3-rc..1", "1.2.3+", "1.2.3+build+meta"]) {
      expect(isValidVersion(version), version).toBe(false);
    }
    for (const version of ["1", "1.2", "1.2.3", "v1.2.3", "1.2.3-rc.1", "1.2.3+build.42"]) {
      expect(isValidVersion(version), version).toBe(true);
    }
    expect(compareVersions("not-a-version", "1.0.0")).toBe(-1);
    expect(compareVersions("not-a-version", "also-invalid")).toBe(0);
  });

  it("读取本地版本时优先 package.json，并注入构建信息", () => {
    process.env.APP_VERSION = "9.9.9";
    process.env.APP_BUILD_SHA = "abcdef1234567890";
    process.env.APP_BUILD_TIME = "2026-01-02T03:04:05Z";

    const local = readLocalVersion();
    expect(local.source).toBe("package.json");
    expect(local.version).toBe(PACKAGE_VERSION);
    // 关键语义：环境变量 APP_VERSION 只是兜底，不能覆盖 package.json
    expect(local.version).not.toBe("9.9.9");
    expect(local.commit).toBe("abcdef1234567890");
    expect(local.buildTime).toBe("2026-01-02T03:04:05Z");
  });

  it("commit 展示最多保留七位", () => {
    expect(shortCommit("abcdef123456")).toBe("abcdef1");
    expect(shortCommit("unknown")).toBe("unknown");
    expect(shortCommit("")).toBe("unknown");
  });
});

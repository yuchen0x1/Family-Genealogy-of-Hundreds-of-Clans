import { afterEach, describe, expect, it, vi } from "vitest";

const { cacheGet, cacheSet } = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
vi.mock("@/lib/cache", () => ({ cacheGet, cacheSet }));

import { fetchUpstream, UpstreamError } from "@/lib/updater/github";

afterEach(() => {
  vi.restoreAllMocks();
  cacheGet.mockReset();
  cacheSet.mockReset();
  delete process.env.APP_UPDATE_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("GitHub 上游版本检测", () => {
  it("解析 latest release 并截断超长更新日志", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        tag_name: "v1.4.0+build.7",
        body: "x".repeat(20_100),
        html_url: "https://github.com/example/repo/releases/tag/v1.4.0%2Bbuild.7",
        published_at: "2026-01-02T03:04:05Z",
      }))
      .mockResolvedValueOnce(jsonResponse({ sha: "abcdef1234567890abcdef1234567890abcdef12" }));

    const result = await fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true });
    expect(result).toMatchObject({
      version: "1.4.0",
      tagName: "v1.4.0+build.7",
      commit: "abcdef1234567890abcdef1234567890abcdef12",
      source: "release",
      publishedAt: "2026-01-02T03:04:05Z",
    });
    expect(result.notes).toHaveLength(20_000 + "\n\n…（更新日志过长已截断）".length);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/example/repo/releases/latest",
      "https://api.github.com/repos/example/repo/commits/v1.4.0%2Bbuild.7",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/vnd.github+json" }) }),
    );
    expect(cacheSet).toHaveBeenCalledOnce();
  });

  it("识别稳定版发布资产、校验清单、签名和发布策略标记", async () => {
    const digest = "a".repeat(64);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        tag_name: "v1.4.0",
        body: "修复说明\n<!-- xungen-update-mandatory: true -->\n<!-- xungen-security-fix: true -->\n<!-- xungen-min-supported-version: 1.2.0 -->",
        assets: [
          {
            id: 7,
            name: "xungen-1.4.0.tar.gz",
            url: "https://api.github.com/repos/example/repo/releases/assets/7",
            browser_download_url: "https://github.com/example/repo/releases/download/v1.4.0/xungen-1.4.0.tar.gz",
            size: 1234,
            digest: `sha256:${digest}`,
          },
          { name: "xungen-1.4.0.tar.gz.sha256", url: "https://api.github.com/repos/example/repo/releases/assets/8" },
          { name: "xungen-1.4.0.tar.gz.sig", url: "https://api.github.com/repos/example/repo/releases/assets/9" },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ sha: "abcdef1234567890abcdef1234567890abcdef12" }));

    const result = await fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true });
    expect(result).toMatchObject({
      mandatory: true,
      securityFix: true,
      minSupportedVersion: "1.2.0",
      asset: {
        id: 7,
        name: "xungen-1.4.0.tar.gz",
        size: 1234,
        digest,
        checksumUrl: "https://api.github.com/repos/example/repo/releases/assets/8",
        signatureUrl: "https://api.github.com/repos/example/repo/releases/assets/9",
      },
    });
  });

  it("latest release 为 404 时回退到第一个 tag", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, 404))
      .mockResolvedValueOnce(jsonResponse([
        { name: "v2.0.0", commit: { sha: "abcdef1234567890abcdef1234567890abcdef12" } },
        { name: "v1.9.0", commit: { sha: "old" } },
      ]))
      .mockResolvedValueOnce(jsonResponse({ sha: "abcdef1234567890abcdef1234567890abcdef12" }));

    const result = await fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true });
    expect(result).toMatchObject({
      version: "2.0.0",
      tagName: "v2.0.0",
      commit: "abcdef1234567890abcdef1234567890abcdef12",
      source: "tag",
    });
    expect(result.url).toContain("/releases/tag/v2.0.0");
  });

  it("stable release 无法解析到完整 commit SHA 时拒绝更新目标", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ tag_name: "v1.5.0" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "abcdef123456" }));

    await expect(fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("branch 通道解析 commit，并对分支名进行 URL 编码", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        sha: "abcdef1234567890abcdef1234567890abcdef12",
        html_url: "https://github.com/example/repo/commit/abcdef",
        commit: { message: "修复更新流程\n\n详细说明", author: { date: "2026-01-02T03:04:05Z" } },
      }),
    );

    const result = await fetchUpstream({ repo: "example/repo", channel: "branch", branch: "release/v1", force: true });
    expect(result).toMatchObject({ version: "abcdef123456", commit: "abcdef1234567890abcdef1234567890abcdef12", source: "commit" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/repos/example/repo/commits/release%2Fv1");
  });

  it("透传 GitHub token，并区分限流与鉴权错误", async () => {
    process.env.APP_UPDATE_TOKEN = "secret-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({}, 403, { "x-ratelimit-remaining": "0" }),
    );
    await expect(fetchUpstream({ repo: "private/repo", channel: "stable", branch: "main", force: true }))
      .rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
    }));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(fetchUpstream({ repo: "private/repo", channel: "stable", branch: "main", force: true }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("缓存命中时不请求 GitHub，force 才跳过缓存", async () => {
    cacheGet.mockResolvedValueOnce({ version: "cached", source: "release" });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main" })).resolves.toMatchObject({ version: "cached" });
    expect(fetchMock).not.toHaveBeenCalled();

    cacheGet.mockResolvedValueOnce(null);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ tag_name: "v1.0.0" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "abcdef1234567890abcdef1234567890abcdef12" }));
    await fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("响应结构缺少必要字段时返回 INVALID_RESPONSE", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ tag_name: "" }));
    const error = await fetchUpstream({ repo: "example/repo", channel: "stable", branch: "main", force: true }).catch((e) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

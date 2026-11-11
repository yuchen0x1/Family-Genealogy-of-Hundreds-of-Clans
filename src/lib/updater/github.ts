/**
 * 上游版本检测。
 *
 * 只与配置好的仓库通信（地址来自 config，绝不来自请求参数），因此不存在 SSRF 面。
 * 两种通道：
 *   - stable：读最新 Release（没有 Release 时退回最新 tag）
 *   - branch：读指定分支的最新 commit
 * 匿名访问 GitHub API 限 60 次/小时/IP，故结果缓存 5 分钟，并支持 APP_UPDATE_TOKEN。
 */
import { cacheGet, cacheSet } from "@/lib/cache";
import { githubToken } from "./config";
import { normalizeVersion } from "./version";

export type UpstreamRelease = {
  /** stable 通道为归一化版本号；branch 通道为 commit SHA */
  version: string;
  tagName: string | null;
  commit: string | null;
  publishedAt: string | null;
  /** 更新日志正文（Release body 或 commit message） */
  notes: string;
  url: string | null;
  source: "release" | "tag" | "commit";
};

export class UpstreamError extends Error {
  constructor(
    message: string,
    public code:
      | "NETWORK"
      | "TIMEOUT"
      | "UNAUTHORIZED"
      | "RATE_LIMITED"
      | "NOT_FOUND"
      | "INVALID_RESPONSE"
      | "SERVER",
  ) {
    super(message);
  }
}

const API = "https://api.github.com";
const CACHE_TTL_SECONDS = 300;
const TIMEOUT_MS = 8000;
/** 更新日志正文上限，防止超大 Release body 撑爆页面与数据库 */
const MAX_NOTES = 20000;

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "xungen-updater",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = githubToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: headers(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new UpstreamError("连接上游仓库超时，请检查服务器出网或稍后重试", "TIMEOUT");
    }
    throw new UpstreamError("无法连接上游仓库，请检查服务器网络与 DNS", "NETWORK");
  }

  if (res.status === 401) throw new UpstreamError("上游仓库鉴权失败，请检查 APP_UPDATE_TOKEN", "UNAUTHORIZED");
  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new UpstreamError("GitHub API 匿名访问次数已用尽，请配置 APP_UPDATE_TOKEN 或稍后重试", "RATE_LIMITED");
    }
    throw new UpstreamError("上游仓库拒绝访问（403），若为私有仓库请配置 APP_UPDATE_TOKEN", "UNAUTHORIZED");
  }
  if (res.status === 404) throw new UpstreamError("上游仓库或发布不存在（404），请检查 APP_UPDATE_REPO", "NOT_FOUND");
  if (!res.ok) throw new UpstreamError(`上游仓库返回异常状态 ${res.status}`, "SERVER");

  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError("上游返回内容无法解析", "INVALID_RESPONSE");
  }
}

type GhRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
};

type GhTag = { name?: string; commit?: { sha?: string } };

type GhCommit = {
  sha?: string;
  html_url?: string;
  commit?: { message?: string; author?: { date?: string } };
};

function clampNotes(raw: string | undefined | null): string {
  const text = String(raw ?? "").trim();
  if (text.length <= MAX_NOTES) return text;
  return `${text.slice(0, MAX_NOTES)}\n\n…（更新日志过长已截断）`;
}

async function resolveTagCommit(repo: string, tag: string): Promise<string> {
  const result = await apiGet<GhCommit>(`/repos/${repo}/commits/${encodeURIComponent(tag)}`);
  const sha = String(result.sha ?? "").trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new UpstreamError("上游 tag 未解析为有效的完整 commit SHA", "INVALID_RESPONSE");
  }
  return sha;
}

/** stable 通道：优先 Release，其次 tag；固定解析到完整 commit，避免下载可变 tag。 */
async function fetchStable(repo: string): Promise<UpstreamRelease> {
  let release: GhRelease | null = null;
  try {
    release = await apiGet<GhRelease>(`/repos/${repo}/releases/latest`);
  } catch (err) {
    if (!(err instanceof UpstreamError && err.code === "NOT_FOUND")) throw err;
  }

  if (release) {
    const tag = String(release.tag_name ?? "").trim();
    if (!tag) throw new UpstreamError("上游 Release 缺少 tag 名称", "INVALID_RESPONSE");
    const commit = await resolveTagCommit(repo, tag);
    return {
      version: normalizeVersion(tag),
      tagName: tag,
      commit,
      publishedAt: release.published_at ?? null,
      notes: clampNotes(release.body) || "（该版本未提供更新说明）",
      url: release.html_url ?? null,
      source: "release",
    };
  }

  // 仓库只用 tag 不用 Release 是完全合法的发布方式，退回 tag 而不是报错
  const tags = await apiGet<GhTag[]>(`/repos/${repo}/tags?per_page=30`);
  const first = Array.isArray(tags) ? tags.find((t) => t?.name) : undefined;
  if (!first?.name) {
    throw new UpstreamError("上游仓库既没有 Release 也没有任何 tag，无法判断版本", "NOT_FOUND");
  }
  const commit = await resolveTagCommit(repo, first.name);
  return {
    version: normalizeVersion(first.name),
    tagName: first.name,
    commit,
    publishedAt: null,
    notes: "（该 tag 未附带更新说明，可到仓库的 commits 页面查看改动）",
    url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(first.name)}`,
    source: "tag",
  };
}

/** branch 通道：只认 commit，没有语义化版本可比。 */
async function fetchBranch(repo: string, branch: string): Promise<UpstreamRelease> {
  const commit = await apiGet<GhCommit>(`/repos/${repo}/commits/${encodeURIComponent(branch)}`);
  const sha = String(commit.sha ?? "").trim();
  if (!sha) throw new UpstreamError("上游分支返回结果缺少 commit", "INVALID_RESPONSE");
  return {
    version: sha.slice(0, 12),
    tagName: null,
    commit: sha,
    publishedAt: commit.commit?.author?.date ?? null,
    notes: clampNotes(commit.commit?.message) || "（该提交未提供说明）",
    url: commit.html_url ?? `https://github.com/${repo}/commit/${sha}`,
    source: "commit",
  };
}

/**
 * 获取上游最新版本。
 * @param force 跳过缓存（用户手动点「检查更新」时使用）
 */
export async function fetchUpstream(params: {
  repo: string;
  channel: "stable" | "branch";
  branch: string;
  force?: boolean;
}): Promise<UpstreamRelease> {
  const cacheKey = `update:upstream:${params.repo}:${params.channel}:${params.branch}`;
  if (!params.force) {
    const cached = await cacheGet<UpstreamRelease>(cacheKey);
    if (cached) return cached;
  }

  const result =
    params.channel === "branch"
      ? await fetchBranch(params.repo, params.branch)
      : await fetchStable(params.repo);

  await cacheSet(cacheKey, result, CACHE_TTL_SECONDS);
  return result;
}

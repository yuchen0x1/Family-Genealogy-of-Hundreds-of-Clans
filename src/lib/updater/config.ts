/**
 * 更新通道配置与实例配对。
 *
 * 配对（pairing）在这里的含义：把「这台部署实例」与「上游代码仓库的某条版本线」
 * 绑定起来，使实例知道该向谁检查新版本、自己属于哪个通道，并拥有一个稳定标识
 * 便于在同一次上游发布中区分不同部署。
 *
 * 安全基线：上游地址只来源于环境变量（运维可控），绝不接受来自 Web 请求的任意 URL，
 * 从根上排除 SSRF。后台页面只能读取配对结果，不能修改。
 */
import { existsSync } from "node:fs";
import type { UpdateDriver } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomToken } from "@/lib/crypto";

/** 默认上游仓库，可通过 APP_UPDATE_REPO 覆盖为私有镜像或 fork。 */
const DEFAULT_REPO = "yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans";

const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const CHANNELS = ["stable", "branch"] as const;
const DRIVERS = ["SOURCE", "DOCKER", "SIMULATE"] as const;

export type UpdateChannel = (typeof CHANNELS)[number];

export const SETTING_KEYS = {
  instanceId: "update.instance_id",
  instanceName: "update.instance_name",
} as const;

export type PairingInfo = {
  instanceId: string;
  instanceName: string;
  /** owner/repo */
  repo: string;
  channel: UpdateChannel;
  /** 通道为 branch 时的分支名 */
  branch: string;
  driver: UpdateDriver;
  /** 仓库地址是否来自环境变量（否则为内置默认值） */
  repoFromEnv: boolean;
};

function readRepo(): { repo: string; fromEnv: boolean } {
  const raw = (process.env.APP_UPDATE_REPO || "").trim();
  if (raw) {
    if (!REPO_PATTERN.test(raw)) {
      // 配置错误不应让整个后台崩掉：退回默认值并留下日志，界面照常可用
      console.warn("[updater] APP_UPDATE_REPO 格式非法，已忽略:", raw.slice(0, 100));
    } else {
      return { repo: raw, fromEnv: true };
    }
  }
  return { repo: DEFAULT_REPO, fromEnv: false };
}

function readChannel(): UpdateChannel {
  const raw = (process.env.APP_UPDATE_CHANNEL || "").trim().toLowerCase();
  return (CHANNELS as readonly string[]).includes(raw) ? (raw as UpdateChannel) : "stable";
}

function readBranch(): string {
  const raw = (process.env.APP_UPDATE_BRANCH || "").trim();
  if (!raw) return "main";
  // 分支名按 git 的 ref 规则做最小校验，防止拼出异常 ref
  return /^[A-Za-z0-9._\/-]{1,100}$/.test(raw) ? raw : "main";
}

/**
 * 驱动选择：显式环境变量优先；否则按运行环境推断。
 * 容器内默认 DOCKER（镜像内改代码无效，必须重建），其余默认 SOURCE（宿主机源码部署）。
 */
function readDriver(): UpdateDriver {
  const raw = (process.env.APP_UPDATE_DRIVER || "").trim().toUpperCase();
  if ((DRIVERS as readonly string[]).includes(raw)) return raw as UpdateDriver;
  try {
    if (existsSync("/.dockerenv")) return "DOCKER";
  } catch {
    /* 忽略探测失败 */
  }
  return "SOURCE";
}

/**
 * SIMULATE 会伪造进度却不真正更新，若被误用会让人以为升级成功。
 * 因此生产环境禁止：只有非 production，或显式设置 APP_UPDATE_ALLOW_SIMULATE=true 才可用。
 */
export function isSimulateAllowed(): boolean {
  if (process.env.APP_UPDATE_ALLOW_SIMULATE === "true") return true;
  return process.env.NODE_ENV !== "production";
}

async function readSettingString(key: string): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const value = row?.value as { value?: unknown } | null | undefined;
  const inner = value?.value;
  return typeof inner === "string" && inner.trim() ? inner.trim() : null;
}

/**
 * 确保实例已配对：首次调用生成稳定的 instance_id 并落库。
 * 用 upsert 而非「先查再插」，避免并发首次访问时产生两条不同身份。
 */
export async function ensurePairing(): Promise<PairingInfo> {
  const { repo, fromEnv } = readRepo();

  let instanceId = await readSettingString(SETTING_KEYS.instanceId);
  if (!instanceId) {
    const generated = `xungen-${randomToken(12).slice(0, 24)}`;
    const created = await prisma.systemSetting.upsert({
      where: { key: SETTING_KEYS.instanceId },
      create: {
        key: SETTING_KEYS.instanceId,
        value: { value: generated },
        description: "部署实例标识，用于区分同一上游下的不同部署；由系统自动生成",
      },
      update: {},
    });
    const stored = (created.value as { value?: unknown } | null)?.value;
    instanceId = typeof stored === "string" && stored ? stored : generated;
  }

  const instanceName =
    (await readSettingString(SETTING_KEYS.instanceName)) ||
    (process.env.NEXT_PUBLIC_SITE_URL ? safeHost(process.env.NEXT_PUBLIC_SITE_URL) : "本机实例");

  return {
    instanceId,
    instanceName,
    repo,
    channel: readChannel(),
    branch: readBranch(),
    driver: readDriver(),
    repoFromEnv: fromEnv,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host || "本机实例";
  } catch {
    return "本机实例";
  }
}

/** 展示用：实例 ID 过长时截断，避免后台页面被撑破。 */
export function shortInstanceId(instanceId: string): string {
  if (instanceId.length <= 16) return instanceId;
  return `${instanceId.slice(0, 12)}…`;
}

/** 可选令牌，用于避免 GitHub API 匿名限流（60 次/小时/IP）。 */
export function githubToken(): string | null {
  const token = (process.env.APP_UPDATE_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  return token || null;
}

/** 可选的 Release 资产签名公钥；私钥只允许存在于 CI Secret。 */
export function updateSigningPublicKey(): string | null {
  const key = (process.env.APP_UPDATE_SIGNING_PUBLIC_KEY || "").trim();
  return key || null;
}

/** 开启后，稳定版必须同时具备 SHA-256 与 detached signature 才允许安装。 */
export function requireUpdateSignature(): boolean {
  return process.env.APP_UPDATE_REQUIRE_SIGNATURE === "true";
}

/**
 * 缓存层：优先 Redis，未配置/连接失败时降级为进程内 LRU 缓存。
 * 同时提供 API 限流（滑动窗口计数）。
 */
import Redis from "ioredis";
import { hashToken } from "./crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

type Entry = { value: string; expires: number };
const memory = new Map<string, Entry>();
const counters = new Map<string, { count: number; resetAt: number }>();
const MEMORY_MAX = 2000;
// Redis 不可用时，测试/开发进程内的计数无法被另一个 CLI 进程直接访问。
// 通过一个仅用于本地测试的文件时间戳实现跨进程清理；生产中没有人需要写入该文件，
// 每秒最多检查一次，正常请求不会产生逐请求磁盘 I/O。
const RATE_LIMIT_RESET_FILE = process.env.RATE_LIMIT_RESET_FILE || path.join(process.cwd(), ".storage", ".rate-limit-reset");
let lastResetCheckAt = 0;
let lastResetMarker = 0;

async function maybeResetMemoryLimits() {
  const now = Date.now();
  if (now - lastResetCheckAt < 1000) return;
  lastResetCheckAt = now;
  try {
    const marker = (await stat(/* turbopackIgnore: true */ RATE_LIMIT_RESET_FILE)).mtimeMs;
    if (marker > lastResetMarker) {
      counters.clear();
      lastResetMarker = marker;
    }
  } catch {
    // 标记文件不存在是正常状态。
  }
}

let redis: Redis | null = null;
let redisFailed = false;

function getRedis(): Redis | null {
  if (redisFailed) return null;
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 800,
    });
    redis.on("error", () => {
      // 静默降级，避免刷屏；Redis 恢复后由下次 lazyConnect 重试
      redisFailed = true;
      try { redis?.disconnect(); } catch { /* ignore */ }
      redis = null;
      setTimeout(() => { redisFailed = false; }, 30_000);
    });
    redis.connect().catch(() => { redisFailed = true; redis = null; });
    return redis;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const k = `xungen:${key}`;
  const r = getRedis();
  try {
    if (r) {
      const v = await r.get(k);
      if (v) return JSON.parse(v) as T;
      return null;
    }
  } catch { /* fallthrough */ }
  const local = memory.get(k);
  if (!local) return null;
  if (local.expires < Date.now()) { memory.delete(k); return null; }
  return JSON.parse(local.value) as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
  const k = `xungen:${key}`;
  const r = getRedis();
  try {
    if (r) { await r.set(k, JSON.stringify(value), "EX", ttlSeconds); return; }
  } catch { /* fallthrough */ }
  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(k, { value: JSON.stringify(value), expires: Date.now() + ttlSeconds * 1000 });
}

export async function cacheInvalidate(prefix: string): Promise<void> {
  const p = `xungen:${prefix}`;
  const r = getRedis();
  try {
    if (r) {
      // SCAN 代替 KEYS：KEYS 在生产 Redis 上是 O(N) 阻塞命令
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, "MATCH", `${p}*`, "COUNT", 100);
        cursor = next;
        if (keys.length) await r.del(...keys);
      } while (cursor !== "0");
      return;
    }
  } catch { /* fallthrough */ }
  for (const k of memory.keys()) if (k.startsWith(p)) memory.delete(k);
}

/** 简单限流：window 秒内最多 limit 次。Redis 不可用时用进程内计数。 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  await maybeResetMemoryLimits();
  const hashed = hashToken(key).slice(0, 24);
  const now = Date.now();
  const r = getRedis();
  try {
    if (r) {
      const rk = `xungen:rl:${hashed}`;
      const count = await r.incr(rk);
      if (count === 1) await r.expire(rk, windowSeconds);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    }
  } catch { /* fallthrough */ }
  const entry = counters.get(hashed);
  if (!entry || entry.resetAt < now) {
    // 顺带清理已过期计数键，防止进程内 Map 无限增长
    if (counters.size >= MEMORY_MAX) {
      for (const [k, v] of counters) if (v.resetAt < now) counters.delete(k);
    }
    counters.set(hashed, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: 1 <= limit, remaining: limit - 1 };
  }
  entry.count++;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}

export async function cacheHealth(): Promise<"redis" | "memory"> {
  const r = getRedis();
  if (!r) return "memory";
  try { await r.ping(); return "redis"; } catch { return "memory"; }
}

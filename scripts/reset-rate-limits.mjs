/**
 * 仅用于本地测试环境：重置 Redis 中的 API 限流计数。
 * 用途：连续运行多组冒烟/E2E 脚本时，注册与登录接口会累计命中限流（这是安全策略正常生效），
 *       在两轮测试之间清理计数，避免把「限流触发」误判为功能故障。
 * 生产环境请勿执行；也不要把此脚本加入任何自动化部署流程。
 */
import Redis from "ioredis";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const resetFile = process.env.RATE_LIMIT_RESET_FILE || path.join(process.cwd(), ".storage", ".rate-limit-reset");
const r = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });

try {
  await r.connect();
  const keys = await r.keys("xungen:rl:*");
  if (keys.length) await r.del(...keys);
  console.log(`[reset-rate-limits] 已清理 ${keys.length} 个限流计数键（${url}）`);
} catch (err) {
  // 开发服务器的进程内 fallback 计数不在 Redis 中；写入标记文件让同一进程
  // 在下一次请求时清理，避免连续冒烟套件互相污染。
  await mkdir(path.dirname(resetFile), { recursive: true });
  await writeFile(resetFile, `${Date.now()}\n`, "utf8");
  const now = new Date();
  await utimes(resetFile, now, now);
  console.warn(`[reset-rate-limits] Redis 不可用，已写入进程内限流清理标记：${resetFile}（${err instanceof Error ? err.message : String(err)}）`);
} finally {
  r.disconnect();
}

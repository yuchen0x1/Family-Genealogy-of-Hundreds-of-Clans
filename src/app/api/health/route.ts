import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/api";
import { cacheHealth } from "@/lib/cache";

/**
 * 部署健康检查（供 Nginx / Docker healthcheck / 运维探针使用）。
 *
 * 只返回可用性布尔值与缓存模式，绝不返回连接串、数据库版本、表数量、
 * 错误堆栈或任何业务数据，避免匿名探针变成信息泄露入口。
 * Redis 未连接时会自动降级为进程内缓存，因此不影响整体可用性判定。
 */
export const GET = route(async () => {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    // 不向外部暴露数据库错误细节，真实原因写入服务端日志由运维排查
    console.error("[health] database check failed");
  }
  const cache = await cacheHealth();
  return ok(
    { status: database ? "ok" : "degraded", database, cache },
    database ? 200 : 503,
    { "Cache-Control": "no-store" },
  );
});

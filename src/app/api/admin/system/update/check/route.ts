import { NextRequest } from "next/server";
import { ok, route, assertSameOrigin, assertRateLimit, clientIpHash } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getUpdateState } from "@/lib/updater";

/**
 * 强制检查上游是否有新版本（跳过 5 分钟缓存）。
 *
 * 单独成一个接口而不是给 GET 加参数，是为了让「主动检查」可以被独立限流：
 * 匿名访问 GitHub API 只有 60 次/小时，被反复点击会直接耗尽配额。
 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  await assertRateLimit(`update:check:${admin.id}:${clientIpHash(req)}`, 10, 60);

  const state = await getUpdateState({ force: true });
  return ok(state, 200, { "Cache-Control": "no-store" });
});

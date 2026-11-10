import { ok, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import { loadFamilyStats } from "@/lib/family-stats";

type Ctx = { id: string };

/**
 * 家族统计聚合。
 *
 * 只返回聚合数字，不返回任何人物姓名、联系方式或加密字段。
 * 统计随人物变动而变，因此不做服务端缓存——家族规模在统计上限内时
 * 单次查询足以应对，缓存反而会让人在编辑后看到过期数字。
 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const stats = await loadFamilyStats(id);
  return ok(stats, 200, { "Cache-Control": "no-store" });
});

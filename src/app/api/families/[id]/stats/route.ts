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
 *
 * 隐私：协作者（access.level 非空）可看到在世人物的生卒年统计；
 * 匿名访客与其他非协作者访问公开族谱时，只统计已故人物与主动公开的
 * 在世人物，且不返回「在世年龄分布」——否则会把界面刻意隐藏的
 * 出生日期以聚合形式还原出来。
 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const stats = await loadFamilyStats(id, { canSeeLivingDetails: Boolean(access.level) });
  return ok(stats, 200, { "Cache-Control": "no-store" });
});

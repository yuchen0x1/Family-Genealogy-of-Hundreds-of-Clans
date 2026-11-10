import { ok, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import { loadDuplicateCandidates } from "@/lib/duplicate-detection";

type Ctx = { id: string };

/**
 * 家族内疑似重复人物检测。
 *
 * 只读接口：返回疑似配对的判定依据，供人工核对。
 * **不提供任何合并动作**——同名不代表同一人，自动合并会破坏族谱的
 * 血亲结构（把两个人的子女挂到一个人身上），这种错误极难被发现和还原。
 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const report = await loadDuplicateCandidates(id);
  return ok(report, 200, { "Cache-Control": "no-store" });
});

import { NextRequest } from "next/server";
import { ok, route, getQuery } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import { buildPartialGraph } from "@/lib/genealogy";

type Ctx = { id: string };

/** 图谱按需加载：focus 为中心，up/down 控制上下代数，单次最多 200 节点。 */
export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const { params } = getQuery(req);
  const focus = params.get("focus");
  const up = Math.min(5, Math.max(0, Number(params.get("up")) || 2));
  const down = Math.min(5, Math.max(0, Number(params.get("down")) || 2));
  const data = await buildPartialGraph(id, focus, up, down, Boolean(access.level));
  return ok(data, 200, { "Cache-Control": "private, max-age=15" });
});

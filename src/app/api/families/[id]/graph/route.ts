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
  const depth = (value: string | null) => value === null || value.trim() === "" || !Number.isFinite(Number(value))
    ? 2 : Math.min(5, Math.max(0, Math.floor(Number(value))));
  const up = depth(params.get("up"));
  const down = depth(params.get("down"));
  const data = await buildPartialGraph(id, focus, up, down, Boolean(access.level));
  return ok(data, 200, { "Cache-Control": "private, no-store" });
});

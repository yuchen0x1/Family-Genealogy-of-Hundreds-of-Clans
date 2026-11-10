import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import { buildKinshipGraph, calculateKinship, getAncestors, getDescendants } from "@/lib/kinship";

type Ctx = { id: string };

/**
 * GET /api/families/:id/kinship?from=xxx&to=yyy
 * GET /api/families/:id/kinship?ancestors=xxx   追溯祖先
 * GET /api/families/:id/kinship?descendants=xxx 查询后代
 */
export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const { params } = getQuery(req);

  const [members, relations] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId: id, deletedAt: null },
      select: { id: true, surnameText: true, givenName: true, gender: true, birthYear: true, generationNumber: true, isLiving: true, visibility: true },
    }),
    prisma.familyRelationship.findMany({
      where: { familyId: id, deletedAt: null },
      select: { fromPersonId: true, toPersonId: true, type: true, subtype: true, verification: true },
    }),
  ]);

  // 公开族谱的匿名访问者，只能查询已主动公开的人物
  const allowed = access.level
    ? new Set(members.map((m) => m.id))
    : new Set(members.filter((m) => m.visibility === "PUBLIC" || !m.isLiving).map((m) => m.id));

  const graph = buildKinshipGraph(
    members.map((m) => ({
      id: m.id,
      gender: m.gender as "MALE" | "FEMALE" | "UNKNOWN",
      birthYear: m.birthYear,
      generationNumber: m.generationNumber,
      name: `${m.surnameText}${m.givenName}`,
    })),
    relations.map((r) => ({
      fromPersonId: r.fromPersonId,
      toPersonId: r.toPersonId,
      type: r.type as never,
      subtype: r.subtype as never,
      verification: r.verification as never,
    })),
    { requireVerified: true },
  );

  const ancestorsOf = params.get("ancestors");
  const descendantsOf = params.get("descendants");
  if (ancestorsOf || descendantsOf) {
    const target = (ancestorsOf || descendantsOf)!;
    if (!allowed.has(target)) throw new ApiError(403, "无权查询该人物的家族关系", "FORBIDDEN");
    const groups = ancestorsOf ? getAncestors(graph, target) : getDescendants(graph, target);
    return ok({
      mode: ancestorsOf ? "ancestors" : "descendants",
      target,
      groups: groups.map((g) => ({
        generation: g.generation,
        people: g.ids.filter((pid) => allowed.has(pid)).map((pid) => ({
          id: pid,
          name: graph.people.get(pid)?.name ?? "",
        })),
      })),
    });
  }

  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) throw new ApiError(400, "请提供 from / to（或 ancestors / descendants）参数", "MISSING_PARAMS");
  if (!allowed.has(from) || !allowed.has(to)) throw new ApiError(403, "无权查询该人物的家族关系", "FORBIDDEN");

  const result = calculateKinship(graph, from, to, { dialect: params.get("dialect") === "northern" ? "northern" : "standard" });
  return ok({
    ...result,
    fromName: graph.people.get(from)?.name ?? "",
    toName: graph.people.get(to)?.name ?? "",
    ignoredRelations: graph.ignored.length,
    notice: "亲属称谓仅依据已核实关系计算；收养、婚姻与过继不会被当作生物学血缘。",
  });
});

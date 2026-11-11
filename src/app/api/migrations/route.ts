import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { visibleFamilyIds } from "@/lib/permissions";

/**
 * 迁徙记录：仅返回有来源的宏观人口迁徙，或用户有权访问的家族迁徙记录。
 * 永远不自动生成或展示任何没有史料来源的「祖先迁徙路线」。
 */
export const GET = route(async (req: NextRequest) => {
  const { page, pageSize, params } = getQuery(req);
  const user = await getCurrentUser();
  const myFamilyIds = await visibleFamilyIds(user?.id);
  const level = params.get("level");
  const surname = params.get("surname");

  const where = {
    deletedAt: null,
    AND: [
      { OR: [{ sourceId: { not: null } }, ...(myFamilyIds.length ? [{ familyId: { in: myFamilyIds } }] : [])] },
    ],
    ...(level ? { evidenceLevel: level as never } : {}),
    ...(surname ? { surname: { name: surname } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.migrationRecord.findMany({
      where, orderBy: [{ startYear: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      include: {
        fromPlace: { select: { id: true, historicalName: true, modernName: true, longitude: true, latitude: true } },
        toPlace: { select: { id: true, historicalName: true, modernName: true, longitude: true, latitude: true } },
        source: { select: { id: true, title: true, author: true, credibility: true } },
        surname: { select: { id: true, name: true } },
      },
    }),
    prisma.migrationRecord.count({ where }),
  ]);
  return ok(paginate(rows.map((r) => ({
    ...r,
    fromPlace: r.fromPlace ? { ...r.fromPlace, longitude: Number(r.fromPlace.longitude), latitude: Number(r.fromPlace.latitude) } : null,
    toPlace: r.toPlace ? { ...r.toPlace, longitude: Number(r.toPlace.longitude), latitude: Number(r.toPlace.latitude) } : null,
  })), total, page, pageSize));
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate } from "@/lib/api";

/** 古今地名（坐标为现代治所近似值，供地图示意，不是考古定点）。 */
export const GET = route(async (req: NextRequest) => {
  const { q, page, pageSize, params } = getQuery(req);
  const level = params.get("level");
  const where = {
    deletedAt: null,
    ...(q ? { OR: [{ historicalName: { contains: q } }, { modernName: { contains: q } }, { aliases: { some: { alias: { contains: q } } } }] } : {}),
    ...(level ? { placeType: level as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.historicalPlace.findMany({
      where, orderBy: { historicalName: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { aliases: { select: { alias: true, era: true } } },
    }),
    prisma.historicalPlace.count({ where }),
  ]);
  return ok(paginate(rows.map((r) => ({
    ...r,
    longitude: r.longitude ? Number(r.longitude) : null,
    latitude: r.latitude ? Number(r.latitude) : null,
  })), total, page, pageSize));
});

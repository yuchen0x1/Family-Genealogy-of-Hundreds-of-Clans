import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  all: z.boolean().optional(),
}).refine((v) => v.all === true || (v.ids && v.ids.length > 0), { message: "请指定要标记已读的通知，或传 all: true" });

export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const { page, pageSize, params } = getQuery(req);
  const unreadOnly = params.get("unread") === "1";
  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return ok({ ...paginate(rows, total, page, pageSize), unread });
});

/** 标记已读：只能操作自己的通知；ids 会与 userId 做交集，避免越权批量更新。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const data = await parseBody(patchSchema, req);
  const where = data.all
    ? { userId: user.id, readAt: null }
    : { userId: user.id, readAt: null, id: { in: data.ids ?? [] } };
  const result = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return ok({ updated: result.count });
});

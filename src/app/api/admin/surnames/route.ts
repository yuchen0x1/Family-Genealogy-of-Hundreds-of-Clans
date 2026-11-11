import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireReviewer } from "@/lib/admin";
import { cacheInvalidate } from "@/lib/cache";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  id: z.string().uuid(),
  reviewStatus: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "DISPUTED"]),
  credibility: z.enum(["DOCUMENTED", "TRADITION", "INFERRED", "UNVERIFIED"]).optional(),
});

export const GET = route(async (req: NextRequest) => {
  await requireReviewer();
  const { q, page, pageSize, params } = getQuery(req);
  const status = params.get("status");
  const where = {
    deletedAt: null,
    ...(status ? { reviewStatus: status as never } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { pinyin: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.surname.findMany({
      where, orderBy: [{ popularityRank: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, name: true, pinyin: true, category: true, originSummary: true,
        credibility: true, reviewStatus: true, viewCount: true, createdAt: true,
        _count: { select: { origins: true, figures: true, migrations: true } },
      },
    }),
    prisma.surname.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

/** 姓氏资料审核：更新审核状态/可信程度后清除列表缓存，避免页面继续展示旧状态。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const reviewer = await requireReviewer();
  const data = await parseBody(patchSchema, req);
  const surname = await prisma.surname.findUnique({ where: { id: data.id } });
  if (!surname) throw new ApiError(404, "姓氏不存在", "NOT_FOUND");
  const updated = await prisma.surname.update({
    where: { id: data.id },
    data: {
      reviewStatus: data.reviewStatus as never,
      ...(data.credibility ? { credibility: data.credibility as never } : {}),
    },
  });
  await cacheInvalidate("surnames:list:");
  await audit(req, reviewer.id, "admin.surname.review", "surname", data.id, {
    before: { reviewStatus: surname.reviewStatus, credibility: surname.credibility },
    after: { reviewStatus: updated.reviewStatus, credibility: updated.credibility },
  });
  return ok({ id: updated.id, reviewStatus: updated.reviewStatus, credibility: updated.credibility });
});

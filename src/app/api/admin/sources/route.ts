import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireReviewer } from "@/lib/admin";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  id: z.string().uuid(),
  reviewStatus: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "DISPUTED"]),
  credibility: z.enum(["PRIMARY", "SECONDARY", "TERTIARY", "UNRATED"]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const GET = route(async (req: NextRequest) => {
  await requireReviewer();
  const { q, page, pageSize, params } = getQuery(req);
  const status = params.get("status");
  const where = {
    deletedAt: null,
    ...(status ? { reviewStatus: status as never } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { author: { contains: q } }, { publisher: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.historicalSource.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, title: true, author: true, edition: true, publisher: true, publishYear: true,
        volumeOrPage: true, originalQuote: true, digitalUrl: true, sourceType: true,
        credibility: true, reviewStatus: true, notes: true, createdAt: true,
        _count: { select: { citations: true } },
      },
    }),
    prisma.historicalSource.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

/** 史料审核：只修改审核状态与可信程度，不改写原文引用，不凭空补充史料。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const reviewer = await requireReviewer();
  const data = await parseBody(patchSchema, req);
  const source = await prisma.historicalSource.findUnique({ where: { id: data.id } });
  if (!source) throw new ApiError(404, "史料不存在", "NOT_FOUND");
  const updated = await prisma.historicalSource.update({
    where: { id: data.id },
    data: {
      reviewStatus: data.reviewStatus as never,
      ...(data.credibility ? { credibility: data.credibility as never } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });
  await audit(req, reviewer.id, "admin.source.review", "historical_source", data.id, {
    before: { reviewStatus: source.reviewStatus, credibility: source.credibility },
    after: { reviewStatus: updated.reviewStatus, credibility: updated.credibility, notes: data.notes ?? null },
  });
  return ok({
    id: updated.id, reviewStatus: updated.reviewStatus,
    notice: "审核状态已更新。平台不会自动改写原文或补写缺失史料；缺卷次页码的条目仍应标注为待审核。",
  });
});

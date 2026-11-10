import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireReviewer } from "@/lib/admin";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["DRAFT", "PUBLISHED", "PENDING_REVIEW", "HIDDEN", "REMOVED"]),
  reason: z.string().trim().max(1000).optional(),
});

/** 内容审核列表：含未发布/已下架内容，但只返回元数据，不返回私有族谱人物明细。 */
export const GET = route(async (req: NextRequest) => {
  await requireReviewer();
  const { q, page, pageSize, params } = getQuery(req);
  const status = params.get("status");
  const where = {
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, title: true, type: true, status: true, visibility: true,
        createdAt: true, viewCount: true,
        author: { select: { profile: { select: { displayName: true } } } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

/** 下架 / 恢复内容。审核动作写入审计日志，不做物理删除。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const reviewer = await requireReviewer();
  const data = await parseBody(patchSchema, req);
  const post = await prisma.post.findUnique({ where: { id: data.id }, select: { id: true, status: true, title: true } });
  if (!post) throw new ApiError(404, "内容不存在", "NOT_FOUND");
  const updated = await prisma.post.update({ where: { id: data.id }, data: { status: data.status as never } });
  await audit(req, reviewer.id, "admin.post.moderate", "post", data.id, {
    before: { status: post.status }, after: { status: updated.status, reason: data.reason ?? null },
  });
  return ok({ id: updated.id, status: updated.status });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { postReadWhere, postView, buildCommentTree, type PostRow, type CommentRow } from "@/lib/community";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const INCLUDE = {
  author: { select: { id: true, profile: { select: { displayName: true, surname: true, location: true, privacySettings: true } } } },
  surname: { select: { id: true, name: true } },
  family: { select: { id: true, name: true, visibility: true } },
  _count: { select: { comments: true } },
} as const;

const patchSchema = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  content: z.string().trim().min(2).max(20000).optional(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN", "REMOVED"]).optional(),
});

/** 详情 + 两级评论树。浏览量仅对公开可见内容递增，不改变权限。 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const where = await postReadWhere(user);
  const post = await prisma.post.findFirst({ where: { id, ...where }, include: INCLUDE });
  if (!post) throw new ApiError(404, "内容不存在或无权查看", "NOT_FOUND");

  const comments = await prisma.comment.findMany({
    where: { postId: id, deletedAt: null, status: { not: "HIDDEN" } },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, profile: { select: { displayName: true, surname: true, location: true, privacySettings: true } } } },
    },
  });
  const isModerator = Boolean(user?.isAdmin || user?.permissions.includes("post:moderate"));
  // 异步递增浏览量，不阻塞响应
  void prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  return ok({
    ...postView(post as PostRow, user?.id),
    comments: buildCommentTree(comments as CommentRow[], user?.id, isModerator),
    canModerate: isModerator,
  });
});

/** 编辑：作者本人可改内容与可见性；版主可额外改状态（下架）。 */
export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, familyId: true, title: true, status: true } });
  if (!post) throw new ApiError(404, "内容不存在", "NOT_FOUND");
  const isModerator = user.isAdmin || user.permissions.includes("post:moderate");
  if (post.authorId !== user.id && !isModerator) throw new ApiError(403, "只能编辑自己发布的内容", "FORBIDDEN");
  const data = await parseBody(patchSchema, req);
  if (data.status && !isModerator) throw new ApiError(403, "内容状态仅审核人员可修改", "FORBIDDEN");
  if (data.visibility === "FAMILY" && !post.familyId) {
    throw new ApiError(400, "未关联家族的内容不能设为家族可见", "FAMILY_REQUIRED");
  }
  await audit(req, user.id, "post.update", "post", id, { before: { title: post.title, status: post.status }, after: data });
  const updated = await prisma.post.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility as never } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
      ...(data.status !== undefined ? { status: data.status as never } : {}),
    },
    include: INCLUDE,
  });
  return ok(postView(updated as PostRow, user.id));
});

/** 软删除：作者本人或版主可操作，内容保留在数据库以便审计与恢复。 */
export const DELETE = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const post = await prisma.post.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, title: true } });
  if (!post) throw new ApiError(404, "内容不存在", "NOT_FOUND");
  const isModerator = user.isAdmin || user.permissions.includes("post:moderate");
  if (post.authorId !== user.id && !isModerator) throw new ApiError(403, "只能删除自己发布的内容", "FORBIDDEN");
  await prisma.post.update({ where: { id }, data: { deletedAt: new Date(), status: "REMOVED" } });
  await audit(req, user.id, "post.delete", "post", id, { before: { title: post.title } });
  return ok({ deleted: true, recoverable: true });
});

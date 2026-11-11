import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { commentCreateSchema } from "@/lib/validation";
import { postReadWhere, buildCommentTree, commentView, notify, type CommentRow } from "@/lib/community";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const AUTHOR = {
  author: { select: { id: true, profile: { select: { displayName: true, surname: true, location: true, privacySettings: true } } } },
} as const;

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const post = await prisma.post.findFirst({
    where: { id, ...(await postReadWhere(user)) }, select: { id: true },
  });
  if (!post) throw new ApiError(404, "内容不存在或无权查看", "NOT_FOUND");
  const rows = await prisma.comment.findMany({
    where: { postId: id, deletedAt: null, status: { not: "HIDDEN" } },
    orderBy: { createdAt: "asc" }, include: AUTHOR,
    // 硬上限防御超大帖子拖垮内存；正常帖子远达不到
    take: 1000,
  });
  return ok(buildCommentTree(rows as CommentRow[], user?.id, Boolean(user?.isAdmin || user?.permissions.includes("post:moderate"))));
});

/** 发表评论/回复；父评论必须属于同一帖子；通知帖子作者（自己评论自己不发通知）。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await requireUser();
  await assertRateLimit(`comment.create:${user.id}`, 20, 60);
  const data = await parseBody(commentCreateSchema, req);
  const post = await prisma.post.findFirst({
    where: { id, ...(await postReadWhere(user)) },
    select: { id: true, authorId: true, title: true, status: true },
  });
  if (!post) throw new ApiError(404, "内容不存在或无权查看", "NOT_FOUND");
  if (post.status !== "PUBLISHED" && post.authorId !== user.id) {
    throw new ApiError(409, "该内容当前不接受评论", "POST_NOT_PUBLISHED");
  }
  if (data.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: data.parentId, postId: id, deletedAt: null }, select: { id: true },
    });
    if (!parent) throw new ApiError(400, "回复的评论不存在或不属于该内容", "INVALID_PARENT");
  }
  const comment = await prisma.comment.create({
    data: {
      postId: id, authorId: user.id, parentId: data.parentId ?? null,
      content: data.content, status: "PUBLISHED",
    },
    include: AUTHOR,
  });
  if (post.authorId !== user.id) {
    await notify(post.authorId, "post.commented", { postId: id, commentId: comment.id, title: post.title });
  }
  await audit(req, user.id, "comment.create", "comment", comment.id, { after: { postId: id, parentId: data.parentId ?? null } });
  return ok(commentView(comment as CommentRow, user.id), 201);
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

/** 软删除评论：作者本人或内容审核人员；保留原文供审计，前端显示为已移除。 */
export const DELETE = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const comment = await prisma.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true, postId: true, content: true },
  });
  if (!comment) throw new ApiError(404, "评论不存在", "NOT_FOUND");
  const isModerator = user.isAdmin || user.permissions.includes("post:moderate");
  if (comment.authorId !== user.id && !isModerator) throw new ApiError(403, "只能删除自己的评论", "FORBIDDEN");
  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date(), status: "REMOVED" } });
  await audit(req, user.id, "comment.delete", "comment", id, { before: { postId: comment.postId } });
  return ok({ deleted: true, recoverable: true });
});

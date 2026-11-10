import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { postCreateSchema } from "@/lib/validation";
import { visibleFamilyIds } from "@/lib/permissions";
import { postReadWhere, postView, type PostRow } from "@/lib/community";
import { audit } from "@/lib/audit";

const POST_INCLUDE = {
  author: { select: { id: true, profile: { select: { displayName: true, surname: true, location: true, privacySettings: true } } } },
  surname: { select: { id: true, name: true } },
  family: { select: { id: true, name: true, visibility: true } },
  _count: { select: { comments: true } },
} as const;

/** 帖子流：按类型/姓氏/关键词筛选，权限过滤在数据库层完成，不返回私密族谱内容。 */
export const GET = route(async (req: NextRequest) => {
  const user = await getCurrentUser();
  const { q, page, pageSize, params } = getQuery(req);
  const type = params.get("type");
  const surnameId = params.get("surnameId");
  const mine = params.get("mine") === "1";
  if (mine && !user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const types = ["SEEK_RELATIVE", "DISCUSSION", "ANNOUNCEMENT", "EVENT", "FAMILY_NEWS", "CORRECTION"];
  if (type && !types.includes(type)) throw new ApiError(400, "未知的帖子类型", "INVALID_TYPE");

  const readWhere = await postReadWhere(user);
  // 可见性条件与业务筛选必须用 AND 组合：若直接展开，关键词的 OR 会覆盖权限 OR，导致私有帖子泄露。
  const where = {
    AND: [
      readWhere,
      {
        ...(type ? { type: type as never } : {}),
        ...(surnameId ? { surnameId } : {}),
        ...(mine ? { authorId: user!.id } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { content: { contains: q } }, { tags: { has: q } }] } : {}),
      },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where, include: POST_INCLUDE, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.post.count({ where }),
  ]);
  return ok(paginate(rows.map((r) => postView(r as PostRow, user?.id)), total, page, pageSize));
});

/** 发帖：公告类型需要内容审核权限；FAMILY 可见性必须绑定本人可写的家族。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await assertRateLimit(`post.create:${user.id}`, 10, 60);
  const data = await parseBody(postCreateSchema, req);

  if (data.type === "ANNOUNCEMENT" && !user.isAdmin && !user.permissions.includes("post:moderate")) {
    throw new ApiError(403, "发布全站公告需要内容审核权限", "FORBIDDEN");
  }
  if (data.visibility === "FAMILY") {
    if (!data.familyId) throw new ApiError(400, "家族可见的帖子必须指定所属家族", "FAMILY_REQUIRED");
    const ids = await visibleFamilyIds(user.id);
    if (!ids.includes(data.familyId)) throw new ApiError(403, "无权在该家族发布内容", "FORBIDDEN");
  }
  if (data.familyId) {
    const family = await prisma.family.findFirst({ where: { id: data.familyId, deletedAt: null }, select: { id: true } });
    if (!family) throw new ApiError(400, "关联家族不存在", "INVALID_FAMILY");
    const ids = await visibleFamilyIds(user.id);
    if (!ids.includes(data.familyId)) throw new ApiError(403, "只能关联自己参与的家族", "FORBIDDEN");
  }
  if (data.surnameId) {
    const surname = await prisma.surname.findUnique({ where: { id: data.surnameId }, select: { id: true } });
    if (!surname) throw new ApiError(400, "关联姓氏不存在", "INVALID_SURNAME");
  }

  const post = await prisma.post.create({
    data: {
      authorId: user.id,
      title: data.title,
      content: data.content,
      type: data.type as never,
      familyId: data.familyId ?? null,
      surnameId: data.surnameId ?? null,
      clues: (data.clues ?? {}) as unknown as Prisma.InputJsonValue,
      visibility: data.visibility as never,
      tags: data.tags ?? [],
      status: "PUBLISHED",
    },
    include: POST_INCLUDE,
  });
  await audit(req, user.id, "post.create", "post", post.id, {
    after: { type: post.type, visibility: post.visibility, title: post.title },
  });
  return ok(postView(post as PostRow, user.id), 201);
});

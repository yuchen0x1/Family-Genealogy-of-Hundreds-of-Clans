import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ADMIN_NOTE } from "@/lib/admin";

const patchSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  roleKeys: z.array(z.enum(["user", "editor", "moderator", "admin"])).max(4).optional(),
}).refine((v) => v.status !== undefined || v.roleKeys !== undefined, { message: "请指定要修改的状态或角色" });

/** 用户列表：后台可见邮箱用于账号管理，但不返回密码哈希、会话令牌与族谱明细。 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const { q, page, pageSize, params } = getQuery(req);
  const status = params.get("status");
  const where = {
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
    ...(q ? { OR: [{ email: { contains: q } }, { profile: { displayName: { contains: q } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, email: true, status: true, createdAt: true, lastLoginAt: true, deletedAt: true,
        profile: { select: { displayName: true, surname: true } },
        roles: { select: { role: { select: { key: true, name: true } } } },
        _count: { select: { ownedFamilies: true, posts: true, documents: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return ok({
    ...paginate(rows, total, page, pageSize),
    notice: ADMIN_NOTE,
  });
});

/** 停权 / 恢复 / 角色调整。禁止停用自己的账号、禁止移除自己的管理员权限。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const data = await parseBody(patchSchema, req);
  if (data.userId === admin.id) {
    if (data.status && data.status !== "ACTIVE") throw new ApiError(400, "不能停用自己的账号", "SELF_SUSPEND");
    if (data.roleKeys && !data.roleKeys.includes("admin")) throw new ApiError(400, "不能移除自己的管理员权限", "SELF_DEMOTE");
  }
  const target = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, email: true, status: true, roles: { select: { role: { select: { key: true } } } } },
  });
  if (!target) throw new ApiError(404, "用户不存在", "NOT_FOUND");

  if (data.roleKeys) {
    const roles = await prisma.role.findMany({ where: { key: { in: data.roleKeys } }, select: { id: true, key: true } });
    if (roles.length !== data.roleKeys.length) throw new ApiError(400, "存在未知角色", "INVALID_ROLE");
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: data.userId } }),
      prisma.userRole.createMany({ data: roles.map((r) => ({ userId: data.userId, roleId: r.id })), skipDuplicates: true }),
    ]);
  }
  if (data.status) {
    await prisma.user.update({ where: { id: data.userId }, data: { status: data.status as never } });
    if (data.status !== "ACTIVE") {
      // 停权时同步撤销全部会话，确保立即生效
      await prisma.userSession.updateMany({
        where: { userId: data.userId, revokedAt: null }, data: { revokedAt: new Date() },
      });
    }
  }
  await audit(req, admin.id, "admin.user.update", "user", data.userId, {
    before: { status: target.status, roles: target.roles.map((r) => r.role.key) },
    after: { status: data.status ?? null, roleKeys: data.roleKeys ?? null },
  });
  return ok({ updated: true, userId: data.userId });
});

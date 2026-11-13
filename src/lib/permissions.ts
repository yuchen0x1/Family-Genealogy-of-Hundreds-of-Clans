/**
 * 家族级 + 人物级权限判定（RBAC 之外的第二道防线）。
 *
 * 铁律：
 * - 私有族谱默认只有 OWNER / 协作者可见，管理员也不得绕过隐私直接读取人物详情。
 * - 在世人物默认 PRIVATE；公开搜索不会返回私有族谱中的人物。
 * - 搜索与图谱接口必须调用 assertFamilyRead，禁止只靠前端隐藏按钮。
 */
import { FamilyPermissionCode, Visibility } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./api";
import type { AuthUser } from "./auth";

const LEVEL: Record<FamilyPermissionCode, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export type FamilyAccess = {
  level: FamilyPermissionCode | null;
  isOwner: boolean;
  visibility: Visibility;
  isDemo: boolean;
};

export async function getFamilyAccess(userId: string | undefined, familyId: string): Promise<FamilyAccess> {
  const family = await prisma.family.findFirst({
    where: { id: familyId, deletedAt: null },
    select: { ownerId: true, visibility: true, isDemo: true },
  });
  if (!family) throw new ApiError(404, "家族不存在或已删除", "NOT_FOUND");

  if (userId && family.ownerId === userId) {
    return { level: "OWNER", isOwner: true, visibility: family.visibility, isDemo: family.isDemo };
  }
  if (userId) {
    const collab = await prisma.familyCollaborator.findFirst({
      where: { familyId, userId, status: "ACTIVE" },
      select: { permission: true },
    });
    if (collab) {
      return { level: collab.permission, isOwner: false, visibility: family.visibility, isDemo: family.isDemo };
    }
  }
  return { level: null, isOwner: false, visibility: family.visibility, isDemo: family.isDemo };
}

/** 可读：公开族谱任何人可读；私有族谱必须有协作者/所有者权限。 */
export async function assertFamilyRead(user: AuthUser | null, familyId: string): Promise<FamilyAccess> {
  const access = await getFamilyAccess(user?.id, familyId);
  if (access.visibility !== Visibility.PUBLIC && !access.level) {
    throw new ApiError(403, "无权访问该家族族谱", "FORBIDDEN");
  }
  return access;
}

/** 可写：至少 EDITOR；OWNER/ADMIN 可管理成员与协作。 */
export async function assertFamilyWrite(user: AuthUser | null, familyId: string, minimum: FamilyPermissionCode = "EDITOR"): Promise<FamilyAccess> {
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  const access = await getFamilyAccess(user.id, familyId);
  if (!access.level || LEVEL[access.level] < LEVEL[minimum]) {
    throw new ApiError(403, "无权修改该家族族谱", "FORBIDDEN");
  }
  return access;
}

export async function assertFamilyOwner(user: AuthUser | null, familyId: string): Promise<FamilyAccess> {
  return assertFamilyWrite(user, familyId, "OWNER");
}

/**
 * 人物级隐私：在世且 PRIVATE 的人物，仅本人所属家族的协作者可见。
 * 公开族谱展示时，调用方必须使用此函数过滤字段（出生日期、传记、敏感信息）。
 */
export function canViewPersonDetails(access: FamilyAccess, person: { isLiving: boolean; visibility: Visibility }): boolean {
  if (access.level) return true;
  if (access.visibility !== Visibility.PUBLIC) return false;
  if (person.visibility === Visibility.PUBLIC) return true;
  // 公开族谱中的在世人物若非主动公开，仅展示姓名与世代，不展示详细资料
  return person.isLiving ? false : person.visibility === Visibility.FAMILY;
}

/** 公开列表/搜索用：私有族谱一律排除；演示族谱明确标注。 */
export const PUBLIC_FAMILY_WHERE = { visibility: Visibility.PUBLIC, deletedAt: null } as const;

/** 内部核对报告包含未公开的年代与线索，仅家族协作者可读。 */
export async function assertFamilyReview(user: AuthUser | null, familyId: string): Promise<FamilyAccess> {
  const access = await assertFamilyRead(user, familyId);
  if (!access.level) throw new ApiError(403, "资料核对仅向家族协作者开放", "REVIEW_FORBIDDEN");
  return access;
}

/** 列出当前用户可见的家族 ID（用于搜索过滤）。 */
export async function visibleFamilyIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const [owned, collaborated] = await Promise.all([
    prisma.family.findMany({ where: { ownerId: userId, deletedAt: null }, select: { id: true } }),
    prisma.familyCollaborator.findMany({ where: { userId, status: "ACTIVE" }, select: { familyId: true } }),
  ]);
  return Array.from(new Set([...owned.map((f) => f.id), ...collaborated.map((c) => c.familyId)]));
}

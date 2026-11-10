import { cookies } from "next/headers";
import { prisma } from "./db";
import { ApiError } from "./api";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = "xungen_session";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
};

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 720);

/** 从 HttpOnly Cookie 恢复会话。数据库只存 token 摘要。 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          profile: true,
          roles: { include: { role: { include: { permissions: true } } } },
          permissions: true,
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return null;

  const roles = session.user.roles.map((r) => r.role.key);
  const permissions = Array.from(new Set([
    ...session.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode)),
    ...session.user.permissions
      .filter((p) => !p.expiresAt || p.expiresAt.getTime() > Date.now())
      .map((p) => p.permissionCode),
  ]));

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.profile?.displayName || session.user.email.split("@")[0],
    roles,
    permissions,
    isAdmin: roles.includes("admin") || permissions.includes("*"),
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "请先登录", "UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ApiError(403, "需要管理员权限", "FORBIDDEN");
  return user;
}

export async function requirePermission(code: string): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin && !user.permissions.includes(code)) {
    throw new ApiError(403, `缺少权限：${code}`, "FORBIDDEN");
  }
  return user;
}

/** 创建会话并写入 Cookie。仅 hash 入库，原 token 不下发到 JS。 */
export async function createSession(userId: string, userAgent?: string, ipHash?: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await prisma.userSession.create({
    data: { userId, tokenHash: hashToken(token), userAgent: userAgent?.slice(0, 500) ?? null, ipHash, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { token, expiresAt };
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.userSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** 账号锁定策略：连续 5 次失败锁定 15 分钟。 */
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

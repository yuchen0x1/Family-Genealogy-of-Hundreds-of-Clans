import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, ApiError, clientIpHash, assertSameOrigin } from "@/lib/api";
import { rateLimit } from "@/lib/cache";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/crypto";
import { createSession, LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const ip = clientIpHash(req);
  const limit = await rateLimit(`login:${ip}`, 15, 300);
  if (!limit.allowed) throw new ApiError(429, "登录尝试过于频繁，请稍后再试", "RATE_LIMITED");

  const data = await parseBody(loginSchema, req);
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { profile: true },
  });
  // 统一错误信息，避免账号枚举
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    throw new ApiError(401, "邮箱或密码错误", "INVALID_CREDENTIALS");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new ApiError(423, `账号已被临时锁定，请于 ${LOGIN_LOCK_MINUTES} 分钟后重试`, "ACCOUNT_LOCKED");
  }

  const valid = verifyPassword(data.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOGIN_MAX_ATTEMPTS ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit(req, null, "auth.login_failed", "user", user.id);
    throw new ApiError(401, "邮箱或密码错误", "INVALID_CREDENTIALS");
  }

  // 兼容开发期旧格式哈希后可在此升级；当前统一 scrypt
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, req.headers.get("user-agent") ?? undefined, ip);
  await audit(req, user.id, "auth.login", "user", user.id);

  return ok({
    id: user.id,
    email: user.email,
    displayName: user.profile?.displayName || user.email.split("@")[0],
  });
});

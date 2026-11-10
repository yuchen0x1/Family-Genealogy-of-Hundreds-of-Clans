import { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { requireUser, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword, hashToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { cacheInvalidate } from "@/lib/cache";

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, "新密码至少 8 位").max(128)
    .regex(/[A-Za-z]/, "新密码需包含字母")
    .regex(/[0-9]/, "新密码需包含数字"),
});

/** 修改密码：验证旧密码；成功后撤销除当前设备外的全部会话。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const data = await parseBody(schema, req);
  // 密码验证是在线爆破面：失败与成功共享计数，限制验证频率
  await assertRateLimit(`pw.verify:${user.id}`, 10, 900);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!account || !verifyPassword(data.currentPassword, account.passwordHash)) {
    throw new ApiError(403, "当前密码不正确", "PASSWORD_MISMATCH");
  }
  if (data.currentPassword === data.newPassword) {
    throw new ApiError(400, "新密码不能与当前密码相同", "SAME_PASSWORD");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(data.newPassword) } });

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : "";
  const revoked = await prisma.userSession.updateMany({
    where: { userId: user.id, revokedAt: null, tokenHash: { not: currentHash } },
    data: { revokedAt: new Date() },
  });
  await cacheInvalidate(`user:${user.id}:`);
  await audit(req, user.id, "me.password.change", "user", user.id, { after: { otherSessionsRevoked: revoked.count } });
  return ok({
    changed: true, otherSessionsRevoked: revoked.count,
    notice: "密码已更新，其他设备已被强制下线。",
  });
});

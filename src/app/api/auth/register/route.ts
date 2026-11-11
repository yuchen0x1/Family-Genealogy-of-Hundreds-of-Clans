import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, ApiError, clientIpHash, assertSameOrigin } from "@/lib/api";
import { rateLimit } from "@/lib/cache";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const limit = await rateLimit(`register:${clientIpHash(req)}`, 8, 3600);
  if (!limit.allowed) throw new ApiError(429, "注册请求过于频繁，请稍后再试", "RATE_LIMITED");

  const data = await parseBody(registerSchema, req);
  const exists = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw new ApiError(409, "该邮箱已注册", "EMAIL_TAKEN");

  const userRole = await prisma.role.findUnique({ where: { key: "user" }, select: { id: true } });
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: hashPassword(data.password),
      profile: { create: { displayName: data.displayName } },
      roles: userRole ? { create: { roleId: userRole.id } } : undefined,
    },
    select: { id: true, email: true },
  });

  await createSession(user.id, req.headers.get("user-agent") ?? undefined, clientIpHash(req));
  await audit(req, user.id, "auth.register", "user", user.id, { after: { email: user.email, agreeTerms: true } });

  return ok({ id: user.id, email: user.email, displayName: data.displayName }, 201);
});

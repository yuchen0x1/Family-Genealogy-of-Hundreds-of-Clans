import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { requireUser, SESSION_COOKIE } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";

/** 会话列表：不返回 tokenHash，仅展示设备、时间与是否已失效，并标出当前设备。 */
export const GET = route(async () => {
  const user = await requireUser();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : null;
  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, tokenHash: true, userAgent: true, ipHash: true, expiresAt: true, revokedAt: true, createdAt: true },
  });
  return ok(sessions.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    createdAt: s.createdAt,
    current: currentHash === s.tokenHash,
    active: !s.revokedAt && s.expiresAt.getTime() > Date.now(),
    // IP 仅存 HMAC 摘要，列表不外泄摘要值
    ipHash: s.ipHash ? "已脱敏" : null,
  })));
});

/** 撤销指定会话：只能操作自己的会话，可一次性全部撤销。 */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (!id && !all) throw new ApiError(400, "请指定会话 id 或使用 all=1", "MISSING_SESSION_ID");
  const where = all ? { userId: user.id } : { id: id!, userId: user.id };
  const result = await prisma.userSession.updateMany({
    where: { ...where, revokedAt: null }, data: { revokedAt: new Date() },
  });
  if (!all && result.count === 0) throw new ApiError(404, "会话不存在或已失效", "NOT_FOUND");
  await audit(req, user.id, "me.session.revoke", "user_session", id, { after: { revoked: result.count, all } });
  return ok({
    revoked: result.count,
    notice: all ? "已撤销全部会话，当前设备也需重新登录。" : "该设备会话已撤销。",
  });
});

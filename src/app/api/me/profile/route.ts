import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

/** 隐私开关键名固定，避免前端写入任意字段造成意外泄露。 */
const PRIVACY_KEYS = ["allowClanSearch", "showSurname", "showLocation", "showEmail", "showRealName"] as const;

export const GET = route(async () => {
  const user = await requireUser();
  const [account, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, createdAt: true, lastLoginAt: true } }),
    prisma.userProfile.findUnique({ where: { userId: user.id } }),
  ]);
  return ok({ account, profile });
});

/** 更新资料与隐私授权。关闭 allowClanSearch 后立即从同姓检索结果中消失。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const data = await parseBody(profileUpdateSchema, req);
  const existing = await prisma.userProfile.findUnique({ where: { userId: user.id } });
  const current = (existing?.privacySettings && typeof existing.privacySettings === "object" && !Array.isArray(existing.privacySettings))
    ? existing.privacySettings as Record<string, unknown> : {};
  const next = { ...current };
  if (data.privacySettings) {
    for (const key of PRIVACY_KEYS) {
      const v = data.privacySettings[key];
      if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") next[key] = v;
    }
  }
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: data.displayName ?? user.displayName,
      bio: data.bio ?? null,
      surname: data.surname ?? null,
      location: data.location ?? null,
      privacySettings: next as Prisma.InputJsonValue,
    },
    update: {
      ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.surname !== undefined ? { surname: data.surname } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.privacySettings ? { privacySettings: next as Prisma.InputJsonValue } : {}),
    },
  });
  await audit(req, user.id, "me.profile.update", "user_profile", profile.id, {
    before: { displayName: existing?.displayName, privacySettings: current },
    after: { displayName: profile.displayName, privacySettings: next },
  });
  return ok({
    id: profile.id, displayName: profile.displayName, bio: profile.bio,
    surname: profile.surname, location: profile.location, privacySettings: profile.privacySettings,
  });
});

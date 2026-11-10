import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";

type Ctx = { id: string; userId: string };

const patchSchema = z.object({
  permission: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "REVOKED", "DECLINED"]).optional(),
});

export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "ADMIN");
  const data = await parseBody(patchSchema, req);
  const target = await prisma.familyCollaborator.findFirst({ where: { familyId: id, userId } });
  if (!target) throw new ApiError(404, "协作者不存在", "NOT_FOUND");
  if (target.permission === "OWNER" && user!.id !== userId) {
    throw new ApiError(403, "不能修改所有者的权限", "OWNER_PROTECTED");
  }
  const updated = await prisma.familyCollaborator.update({ where: { id: target.id }, data });
  await audit(req, user!.id, "collaborator.update", "family_collaborator", target.id, { after: data });
  return ok(updated);
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { id, userId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "ADMIN");
  const target = await prisma.familyCollaborator.findFirst({ where: { familyId: id, userId } });
  if (!target) throw new ApiError(404, "协作者不存在", "NOT_FOUND");
  if (target.permission === "OWNER") throw new ApiError(403, "不能移除家族所有者", "OWNER_PROTECTED");
  await prisma.familyCollaborator.update({ where: { id: target.id }, data: { status: "REVOKED" } });
  await audit(req, user!.id, "collaborator.revoke", "family_collaborator", target.id);
  return ok({ revoked: true });
});

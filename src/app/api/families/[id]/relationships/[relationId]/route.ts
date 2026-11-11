import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite, assertFamilyRead } from "@/lib/permissions";
import { validateRelationship, createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string; relationId: string };

const patchSchema = z.object({
  verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "DISPUTED", "REJECTED"]).optional(),
  evidenceLevel: z.enum(["DOCUMENTED", "TRADITION", "INFERRED", "UNVERIFIED"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  startDateText: z.string().max(100).optional().nullable(),
  endDateText: z.string().max(100).optional().nullable(),
  marriageOrder: z.number().int().min(1).max(50).optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
});

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, relationId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const relation = await prisma.familyRelationship.findFirst({
    where: { id: relationId, familyId: id, deletedAt: null },
    include: {
      fromPerson: { select: { id: true, surnameText: true, givenName: true } },
      toPerson: { select: { id: true, surnameText: true, givenName: true } },
      document: { select: { id: true, title: true } },
    },
  });
  if (!relation) throw new ApiError(404, "关系不存在", "NOT_FOUND");
  return ok(relation);
});

export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, relationId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(patchSchema, req);
  const existing = await prisma.familyRelationship.findFirst({ where: { id: relationId, familyId: id, deletedAt: null } });
  if (!existing) throw new ApiError(404, "关系不存在", "NOT_FOUND");

  // 修改核实状态时重新跑一次冲突检测，避免把有环关系标记为已核实
  if (data.verification === "VERIFIED") {
    const report = await validateRelationship(id, {
      fromPersonId: existing.fromPersonId,
      toPersonId: existing.toPersonId,
      type: existing.type,
      subtype: existing.subtype,
      verification: "VERIFIED",
    }, relationId);
    const critical = report.errors.filter((e) => !e.includes("该关系已存在"));
    if (critical.length) throw new ApiError(409, "关系存在冲突，无法标记为已核实", "RELATIONSHIP_CONFLICT", report);
  }

  const relation = await prisma.familyRelationship.update({ where: { id: relationId }, data });
  await createVersionSnapshot(id, `修改关系核实状态：${relation.type}`, user!.id);
  await audit(req, user!.id, "relationship.update", "family_relationship", relationId, { after: data });
  return ok(relation);
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  assertSameOrigin(req);
  const { id, relationId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const relation = await prisma.familyRelationship.findFirst({ where: { id: relationId, familyId: id, deletedAt: null } });
  if (!relation) throw new ApiError(404, "关系不存在", "NOT_FOUND");
  await prisma.familyRelationship.update({ where: { id: relationId }, data: { deletedAt: new Date() } });
  await createVersionSnapshot(id, `删除关系：${relation.type}`, user!.id);
  await audit(req, user!.id, "relationship.delete", "family_relationship", relationId);
  return ok({ deleted: true, recoverable: true });
});

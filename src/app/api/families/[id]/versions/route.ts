import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const schema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  changeSummary: z.string().max(1000).optional(),
});

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const versions = await prisma.genealogyVersion.findMany({
    where: { familyId: id },
    orderBy: { versionNumber: "desc" },
    take: 50,
    select: { id: true, versionNumber: true, label: true, changeSummary: true, checksum: true, createdAt: true, createdById: true },
  });
  return ok(versions);
});

/** 手动创建版本快照（自动快照由成员/关系写操作触发）。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(schema, req);
  const version = await createVersionSnapshot(id, data.label || "手动备份", user!.id, data.changeSummary);
  await audit(req, user!.id, "version.create", "genealogy_version", version.id);
  return ok({ id: version.id, versionNumber: version.versionNumber, checksum: version.checksum }, 201);
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const schema = z.object({
  generationNumber: z.number().int().min(1).max(500),
  generationChar: z.string().max(10).optional().nullable(),
  poemLine: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const [generations, poems] = await Promise.all([
    prisma.familyGeneration.findMany({ where: { familyId: id }, orderBy: { generationNumber: "asc" } }),
    prisma.generationPoem.findMany({ where: { familyId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return ok({ generations, poems });
});

/** 字辈不根据姓名自动推断，需由有权限的成员明确录入并人工确认。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(schema, req);
  const row = await prisma.familyGeneration.upsert({
    where: { familyId_generationNumber: { familyId: id, generationNumber: data.generationNumber } },
    update: { generationChar: data.generationChar ?? null, poemLine: data.poemLine ?? null, notes: data.notes ?? null },
    create: { familyId: id, ...data },
  });
  await audit(req, user!.id, "generation.upsert", "family_generation", row.id);
  return ok(row);
});

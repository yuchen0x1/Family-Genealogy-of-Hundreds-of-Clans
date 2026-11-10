import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  rootPersonId: z.string().uuid().optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const branches = await prisma.familyBranch.findMany({
    where: { familyId: id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } }, rootPerson: { select: { id: true, givenName: true, surnameText: true } } },
  });
  return ok(branches);
});

export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(schema, req);
  if (data.parentId) {
    const parent = await prisma.familyBranch.findFirst({ where: { id: data.parentId, familyId: id } });
    if (!parent) throw new ApiError(400, "上级分支不属于该家族", "INVALID_BRANCH");
  }
  if (data.rootPersonId) {
    const person = await prisma.familyMember.findFirst({ where: { id: data.rootPersonId, familyId: id } });
    if (!person) throw new ApiError(400, "始祖人物不属于该家族", "INVALID_PERSON");
  }
  const branch = await prisma.familyBranch.create({ data: { familyId: id, ...data } });
  await audit(req, user!.id, "branch.create", "family_branch", branch.id);
  return ok(branch, 201);
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
  characters: z.array(z.string().max(5)).max(500).optional(),
  branchId: z.string().uuid().optional().nullable(),
  sourceText: z.string().max(1000).optional().nullable(),
});

export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(schema, req);
  if (data.branchId) {
    const b = await prisma.familyBranch.findFirst({ where: { id: data.branchId, familyId: id } });
    if (!b) throw new ApiError(400, "分支不属于该家族", "INVALID_BRANCH");
  }
  // characters 可由字辈诗逐字切分生成，但仍需人工审核；不得由人名反推
  const characters = data.characters ?? Array.from(data.content.replace(/[，。、；：\s,.;:]/g, ""));
  const poem = await prisma.generationPoem.create({
    data: {
      familyId: id,
      title: data.title,
      content: data.content,
      characters,
      branchId: data.branchId ?? null,
      sourceText: data.sourceText ?? null,
      reviewStatus: "PENDING",
    },
  });
  await audit(req, user!.id, "poem.create", "generation_poem", poem.id);
  return ok(poem, 201);
});

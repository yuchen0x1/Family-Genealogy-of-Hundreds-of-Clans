import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, getQuery, paginate, assertSameOrigin, ApiError } from "@/lib/api";
import { relationshipCreateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { validateRelationship, createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyRead(user, id);
  const { page, pageSize, params } = getQuery(req);
  const type = params.get("type");
  const where = {
    familyId: id,
    deletedAt: null,
    ...(type ? { type: type as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.familyRelationship.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        fromPerson: { select: { id: true, surnameText: true, givenName: true } },
        toPerson: { select: { id: true, surnameText: true, givenName: true } },
      },
    }),
    prisma.familyRelationship.count({ where }),
  ]);
  return ok(paginate(rows, total, page, pageSize));
});

/** POST：建立关系。校验失败返回 409 + 明细；警告随结果返回供用户确认。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(relationshipCreateSchema, req);

  const report = await validateRelationship(id, {
    fromPersonId: data.fromPersonId,
    toPersonId: data.toPersonId,
    type: data.type as never,
    subtype: data.subtype as never,
    verification: data.verification,
    marriageOrder: data.marriageOrder,
  });
  if (report.errors.length) {
    throw new ApiError(409, "关系校验未通过", "RELATIONSHIP_CONFLICT", report);
  }

  const relation = await prisma.familyRelationship.create({
    data: {
      familyId: id,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      type: data.type as never,
      subtype: data.subtype as never,
      directional: data.type !== "SPOUSE" && data.type !== "SIBLING",
      verification: data.verification as never,
      evidenceLevel: data.evidenceLevel as never,
      startDateText: data.startDateText ?? null,
      endDateText: data.endDateText ?? null,
      marriageOrder: data.marriageOrder ?? null,
      notes: data.notes ?? null,
      sourceId: data.sourceId ?? null,
      documentId: data.documentId ?? null,
      createdById: user!.id,
    },
  });
  await createVersionSnapshot(id, `新增关系：${data.type}`, user!.id);
  await audit(req, user!.id, "relationship.create", "family_relationship", relation.id, { after: data });
  return ok({ relation, warnings: report.warnings }, 201);
});

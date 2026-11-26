import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, getQuery, paginate, assertSameOrigin, ApiError } from "@/lib/api";
import { relationshipCreateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { validateRelationship, createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

async function assertDocumentInFamily(familyId: string, documentId: string) {
  const doc = await prisma.familyDocument.findFirst({
    where: { id: documentId, familyId, deletedAt: null },
    select: { id: true },
  });
  if (!doc) throw new ApiError(400, "关联档案不属于该家族或已删除", "INVALID_DOCUMENT");
}

export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const { page, pageSize, params } = getQuery(req);
  const rawType = params.get("type");
  const type = rawType ? z.enum(["PARENT_CHILD", "SPOUSE", "SIBLING", "ADOPTION", "SUCCESSION", "GUARDIANSHIP", "CROSS_FAMILY_LINK"]).safeParse(rawType) : null;
  if (rawType && !type?.success) throw new ApiError(422, "关系类型筛选值无效", "VALIDATION_ERROR");
  const relationId = params.get("relationId") ? z.string().uuid().parse(params.get("relationId")) : null;
  const where = {
    familyId: id,
    deletedAt: null,
    ...(relationId ? { id: relationId } : {}),
    ...(type?.success ? { type: type.data } : {}),
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
  // 非协作者（公开族谱的匿名/普通访客）只看到关系结构与核实状态，
  // 依据说明 notes、内部来源/档案 ID 与创建者 ID 仅对协作者开放。
  const items = access.level ? rows : rows.map((row) => {
    const copy = { ...row } as Record<string, unknown>;
    delete copy.notes;
    delete copy.sourceId;
    delete copy.documentId;
    delete copy.createdById;
    return copy;
  });
  return ok(paginate(items, total, page, pageSize));
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
  if (data.documentId) await assertDocumentInFamily(id, data.documentId);

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

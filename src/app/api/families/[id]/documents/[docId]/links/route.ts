import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { audit } from "@/lib/audit";

type Ctx = { id: string; docId: string };

const schema = z.object({
  personId: z.string().uuid(),
  linkType: z.enum(["MENTION", "PORTRAIT", "AUTHOR", "SOURCE_SUBJECT", "WITNESS", "OTHER"]).default("MENTION"),
  verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "DISPUTED", "REJECTED"]).default("UNVERIFIED"),
});

async function loadDoc(familyId: string, docId: string) {
  const doc = await prisma.familyDocument.findFirst({ where: { id: docId, familyId, deletedAt: null } });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");
  return doc;
}

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const doc = await loadDoc(id, docId);
  if (!access.level && (doc.visibility !== "PUBLIC" || doc.reviewStatus !== "APPROVED")) {
    throw new ApiError(404, "档案不存在", "NOT_FOUND");
  }
  const links = await prisma.documentPersonLink.findMany({
    where: { documentId: docId },
    include: { person: { select: { id: true, surnameText: true, givenName: true } } },
  });
  return ok(links.map((l) => ({
    id: l.id, personId: l.personId, name: `${l.person.surnameText}${l.person.givenName}`,
    linkType: l.linkType, verification: l.verification, createdAt: l.createdAt,
  })));
});

/** 档案与人物关联：仅建立引用，不会据此推断或创建任何亲属关系。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  await loadDoc(id, docId);
  const data = await parseBody(schema, req);

  const person = await prisma.familyMember.findFirst({
    where: { id: data.personId, familyId: id, deletedAt: null },
    select: { id: true },
  });
  if (!person) throw new ApiError(400, "人物不属于该家族", "INVALID_PERSON");

  const exists = await prisma.documentPersonLink.findUnique({
    where: { documentId_personId_linkType: { documentId: docId, personId: data.personId, linkType: data.linkType } },
  });
  if (exists) throw new ApiError(409, "该人物已以相同类型关联到此档案", "ALREADY_LINKED");

  const link = await prisma.documentPersonLink.create({
    data: { documentId: docId, personId: data.personId, linkType: data.linkType, verification: data.verification },
  });
  await audit(req, user!.id, "document.link", "document_person_link", link.id, { after: data });
  return ok(link, 201);
});

export const DELETE = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const linkId = req.nextUrl.searchParams.get("linkId");
  if (!linkId) throw new ApiError(400, "缺少 linkId", "MISSING_LINK_ID");
  const link = await prisma.documentPersonLink.findFirst({ where: { id: linkId, documentId: docId } });
  if (!link) throw new ApiError(404, "关联不存在", "NOT_FOUND");
  await prisma.documentPersonLink.delete({ where: { id: linkId } });
  await audit(req, user!.id, "document.unlink", "document_person_link", linkId);
  return ok({ deleted: true });
});

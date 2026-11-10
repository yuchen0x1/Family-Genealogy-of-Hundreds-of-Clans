import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { documentView, type DocumentRow } from "@/lib/documents";
import { audit } from "@/lib/audit";

type Ctx = { id: string; docId: string };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  category: z.enum(["OLD_GENEALOGY", "PHOTO", "HISTORICAL_DOCUMENT", "PDF", "TEXT", "AUDIO", "VIDEO", "OTHER"]).optional(),
  description: z.string().max(10000).optional().nullable(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).optional(),
  // 人工校对后的 OCR 文本：只保存文本，绝不据此自动创建亲属关系
  ocrText: z.string().max(200000).optional().nullable(),
  ocrStatus: z.enum(["NONE", "QUEUED", "PROCESSING", "DONE", "FAILED"]).optional(),
  reviewStatus: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "DISPUTED"]).optional(),
});

async function loadDocument(familyId: string, docId: string, hasAccess: boolean) {
  const doc = await prisma.familyDocument.findFirst({
    where: { id: docId, familyId, deletedAt: null },
  });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");
  if (!hasAccess && (doc.visibility !== "PUBLIC" || doc.reviewStatus !== "APPROVED")) {
    throw new ApiError(404, "档案不存在", "NOT_FOUND");
  }
  return doc;
}

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const hasAccess = Boolean(access.level);
  const doc = await loadDocument(id, docId, hasAccess);
  const [versions, links, sources] = await Promise.all([
    prisma.documentVersion.findMany({
      where: { documentId: docId }, orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, sizeBytes: true, checksum: true, changeNote: true, createdAt: true, createdById: true },
    }),
    prisma.documentPersonLink.findMany({
      where: { documentId: docId },
      include: { person: { select: { id: true, surnameText: true, givenName: true } } },
    }),
    prisma.documentSource.findMany({ where: { documentId: docId } }),
  ]);
  return ok({
    ...documentView(doc as DocumentRow, hasAccess),
    versions: versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })),
    personLinks: hasAccess ? links.map((l) => ({
      id: l.id, personId: l.personId, name: `${l.person.surnameText}${l.person.givenName}`,
      linkType: l.linkType, verification: l.verification, createdAt: l.createdAt,
    })) : [],
    sources: hasAccess ? sources.map((s) => ({
      id: s.id, sourceId: s.sourceId, citationText: s.citationText, verification: s.verification,
    })) : [],
  });
});

export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  const data = await parseBody(patchSchema, req);
  // 审核状态变更属于管理动作，需要 ADMIN；其余元数据 EDITOR 即可
  const minimum = data.reviewStatus ? "ADMIN" : "EDITOR";
  await assertFamilyWrite(user, id, minimum);
  await loadDocument(id, docId, true);

  const updated = await prisma.familyDocument.update({
    where: { id: docId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.ocrText !== undefined ? { ocrText: data.ocrText } : {}),
      ...(data.ocrStatus !== undefined ? { ocrStatus: data.ocrStatus } : {}),
      ...(data.reviewStatus !== undefined ? { reviewStatus: data.reviewStatus } : {}),
    },
  });
  await audit(req, user!.id, "document.update", "family_document", docId, { after: data });
  return ok(documentView(updated as DocumentRow, true));
});

/** 软删除：磁盘文件保留，便于版本恢复与审计；不会物理删除资料。 */
export const DELETE = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  await loadDocument(id, docId, true);
  await prisma.familyDocument.update({ where: { id: docId }, data: { deletedAt: new Date() } });
  await audit(req, user!.id, "document.delete", "family_document", docId);
  return ok({ deleted: true, recoverable: true });
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { validateUpload } from "@/lib/upload";
import { newStorageKey, putObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

type Ctx = { id: string; docId: string };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const doc = await prisma.familyDocument.findFirst({ where: { id: docId, familyId: id, deletedAt: null } });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");
  if (!access.level && (doc.visibility !== "PUBLIC" || doc.reviewStatus !== "APPROVED")) {
    throw new ApiError(404, "档案不存在", "NOT_FOUND");
  }
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: docId }, orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, sizeBytes: true, checksum: true, changeNote: true, createdAt: true },
  });
  return ok(versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })));
});

/** 上传新版本：旧版本文件与记录均保留，可指定版本号下载。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const doc = await prisma.familyDocument.findFirst({ where: { id: docId, familyId: id, deletedAt: null } });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "请选择新版本文件", "NO_FILE");
  const upload = await validateUpload(file);
  const oldExt = (doc.fileName.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] || "").toLowerCase();
  if (upload.ext !== oldExt) {
    throw new ApiError(400, `新版本文件类型需与原文件一致（${oldExt}）`, "TYPE_MISMATCH");
  }
  const changeNote = String(form.get("changeNote") || "").slice(0, 500) || null;

  const storageKey = newStorageKey(id, docId, upload.fileName);
  const stored = await putObject(storageKey, upload.bytes);
  const nextVersion = doc.currentVersion + 1;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.documentVersion.create({
      data: {
        documentId: docId, versionNumber: nextVersion, storageKey,
        sizeBytes: BigInt(stored.size), checksum: stored.checksum,
        changeNote, createdById: user!.id,
      },
    });
    return tx.familyDocument.update({
      where: { id: docId },
      data: {
        storageKey, checksum: stored.checksum, sizeBytes: BigInt(stored.size),
        mimeType: upload.mimeType, currentVersion: nextVersion,
      },
    });
  });

  await audit(req, user!.id, "document.version", "family_document", docId, {
    after: { version: nextVersion, size: stored.size, checksum: stored.checksum, changeNote },
  });
  return ok({
    id: updated.id, versionNumber: nextVersion, checksum: stored.checksum,
    sizeBytes: Number(stored.size),
  }, 201);
});

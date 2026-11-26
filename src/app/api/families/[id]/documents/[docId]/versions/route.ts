import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, assertRateLimit, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { validateUpload } from "@/lib/upload";
import { newStorageKey, putObject, deleteObject } from "@/lib/storage";
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
  return ok(versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    sizeBytes: Number(v.sizeBytes),
    createdAt: v.createdAt,
    // 非协作者看不到校验和与变更说明
    ...(access.level ? { checksum: v.checksum, changeNote: v.changeNote } : {}),
  })));
});

/** 上传新版本：旧版本文件与记录均保留，可指定版本号下载。 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  await assertRateLimit(`document.version:${user!.id}`, 60, 3600);
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

  // 版本号在事务内重新读取，避免并发上传各自基于旧 currentVersion 计算；
  // 事务失败（如唯一约束冲突）时删除已写入的文件，避免产生孤儿对象。
  let updated: { id: string };
  let nextVersion: number;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.familyDocument.findUnique({
        where: { id: docId },
        select: { currentVersion: true },
      });
      if (!current) throw new ApiError(404, "档案不存在", "NOT_FOUND");
      const version = current.currentVersion + 1;
      await tx.documentVersion.create({
        data: {
          documentId: docId, versionNumber: version, storageKey,
          sizeBytes: BigInt(stored.size), checksum: stored.checksum,
          changeNote, createdById: user!.id,
        },
      });
      const next = await tx.familyDocument.update({
        where: { id: docId },
        data: {
          storageKey, checksum: stored.checksum, sizeBytes: BigInt(stored.size),
          mimeType: upload.mimeType, currentVersion: version,
          // 内容已变化，之前的审核结论不能继续沿用：新版本必须重新审核，
          // 否则未审核的文件会借助旧的 APPROVED 状态被匿名下载。
          reviewStatus: "PENDING",
        },
      });
      return { doc: next, version };
    });
    updated = result.doc;
    nextVersion = result.version;
  } catch (err) {
    await deleteObject(storageKey).catch(() => undefined);
    throw err;
  }

  await audit(req, user!.id, "document.version", "family_document", docId, {
    after: { version: nextVersion, size: stored.size, checksum: stored.checksum, changeNote },
  });
  return ok({
    id: updated.id, versionNumber: nextVersion, checksum: stored.checksum,
    sizeBytes: Number(stored.size),
  }, 201);
});

import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, getQuery, paginate, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { validateUpload } from "@/lib/upload";
import { newStorageKey, putObject } from "@/lib/storage";
import { documentView, type DocumentRow } from "@/lib/documents";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const metaSchema = z.object({
  title: z.string().trim().min(1, "请填写档案标题").max(300),
  category: z.enum(["OLD_GENEALOGY", "PHOTO", "HISTORICAL_DOCUMENT", "PDF", "TEXT", "AUDIO", "VIDEO", "OTHER"]).default("OTHER"),
  description: z.string().max(10000).optional().nullable(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).default("PRIVATE"),
  sourceText: z.string().max(1000).optional().nullable(),
});

/** 列表：公开访客只能看到已审核且主动公开的档案元数据。 */
export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const hasAccess = Boolean(access.level);
  const { page, pageSize, params } = getQuery(req);
  const keyword = (params.get("keyword") || "").trim();
  const category = params.get("category");
  const where = {
    familyId: id,
    deletedAt: null,
    ...(keyword ? { OR: [{ title: { contains: keyword } }, { description: { contains: keyword } }, { fileName: { contains: keyword } }] } : {}),
    ...(category ? { category: category as never } : {}),
    ...(hasAccess ? {} : { visibility: "PUBLIC" as const, reviewStatus: "APPROVED" as const }),
  };
  const [rows, total] = await Promise.all([
    prisma.familyDocument.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.familyDocument.count({ where }),
  ]);
  return ok(paginate(rows.map((r) => documentView(r as DocumentRow, hasAccess)), total, page, pageSize));
});

/**
 * 上传：multipart/form-data。
 * 文件写入非公开存储目录，DB 保存元数据 + 校验和 + 版本记录；OCR 不会自动执行。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  await assertRateLimit(`document.upload:${user!.id}`, 30, 3600);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "请选择要上传的文件", "NO_FILE");
  const parsed = metaSchema.safeParse({
    title: form.get("title"),
    category: form.get("category") || "OTHER",
    description: form.get("description") || null,
    visibility: form.get("visibility") || "PRIVATE",
    sourceText: form.get("sourceText") || null,
  });
  if (!parsed.success) {
    throw new ApiError(422, "档案元数据校验失败", "VALIDATION_ERROR", parsed.error.flatten());
  }
  const meta = parsed.data;
  const upload = await validateUpload(file);

  const documentId = randomUUID();
  const storageKey = newStorageKey(id, documentId, upload.fileName);
  const stored = await putObject(storageKey, upload.bytes);

  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.familyDocument.create({
      data: {
        id: documentId,
        familyId: id,
        title: meta.title,
        category: meta.category,
        fileName: upload.fileName,
        storageKey,
        mimeType: upload.mimeType,
        sizeBytes: BigInt(stored.size),
        checksum: stored.checksum,
        visibility: meta.visibility,
        description: meta.description ?? null,
        reviewStatus: "PENDING",
        ocrStatus: "NONE",
        currentVersion: 1,
        uploadedById: user!.id,
      },
    });
    await tx.documentVersion.create({
      data: {
        documentId: created.id, versionNumber: 1, storageKey,
        sizeBytes: BigInt(stored.size), checksum: stored.checksum,
        changeNote: "初始上传", createdById: user!.id,
      },
    });
    if (meta.sourceText) {
      await tx.documentSource.create({
        data: { documentId: created.id, citationText: meta.sourceText, verification: "UNVERIFIED" },
      });
    }
    return created;
  });

  await audit(req, user!.id, "document.upload", "family_document", doc.id, {
    after: { title: doc.title, fileName: doc.fileName, size: stored.size, checksum: stored.checksum },
  });
  return ok(documentView(doc as DocumentRow, true), 201);
});

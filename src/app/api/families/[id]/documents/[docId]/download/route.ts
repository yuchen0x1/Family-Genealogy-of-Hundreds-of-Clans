import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { route, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import { getObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

type Ctx = { id: string; docId: string };

/**
 * 受控下载：绝不接收客户端提供的文件路径。
 * 先鉴权 → 再从 DB 取 storageKey（或指定版本的 storageKey）→ 最后读磁盘。
 */
export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const hasAccess = Boolean(access.level);

  const doc = await prisma.familyDocument.findFirst({ where: { id: docId, familyId: id, deletedAt: null } });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");
  if (!hasAccess && (doc.visibility !== "PUBLIC" || doc.reviewStatus !== "APPROVED")) {
    throw new ApiError(404, "档案不存在", "NOT_FOUND");
  }

  const versionParam = req.nextUrl.searchParams.get("version");
  let storageKey = doc.storageKey;
  let fileName = doc.fileName;
  if (versionParam) {
    const n = Number(versionParam);
    if (!Number.isInteger(n) || n < 1) throw new ApiError(400, "版本号无效", "INVALID_VERSION");
    const v = await prisma.documentVersion.findFirst({ where: { documentId: docId, versionNumber: n } });
    if (!v) throw new ApiError(404, "版本不存在", "NOT_FOUND");
    storageKey = v.storageKey;
    fileName = `v${n}-${doc.fileName}`;
  }

  const object = await getObject(storageKey);
  if (!object) throw new ApiError(404, "文件已丢失，请联系管理员恢复备份", "FILE_MISSING");

  const inline = req.nextUrl.searchParams.get("disposition") === "inline";
  const inlineAllowed = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(doc.mimeType);
  const disposition = inline && inlineAllowed ? "inline" : "attachment";
  // 文件名做 RFC 5987 编码，避免中文文件名与 CRLF 注入
  const encoded = encodeURIComponent(fileName).replace(/'/g, "%27");

  const headers: Record<string, string> = {
    "Content-Type": doc.mimeType,
    "Content-Length": String(object.size),
    "Content-Disposition": `${disposition}; filename="download"; filename*=UTF-8''${encoded}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };
  if (disposition === "inline") {
    // 用户上传内容不具备可信来源：沙箱化，禁止脚本与同源访问
    headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
  }
  await audit(req, user?.id ?? null, "document.download", "family_document", docId, { after: { version: versionParam ?? "current", disposition } });
  return new NextResponse(new Uint8Array(object.bytes), { status: 200, headers });
});

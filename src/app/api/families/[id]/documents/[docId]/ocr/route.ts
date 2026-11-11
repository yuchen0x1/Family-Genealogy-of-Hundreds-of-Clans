import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { getObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

type Ctx = { id: string; docId: string };

const schema = z.object({
  /** 人工录入或外部识别后的文本；写入后仍需人工校对，绝不自动转为亲属关系 */
  text: z.string().max(200000).optional(),
  /** 请求调用外部 OCR 服务（需要服务端配置 OCR_API_URL / OCR_API_KEY） */
  auto: z.boolean().optional(),
});

const OCR_API_URL = process.env.OCR_API_URL || "";
const OCR_API_KEY = process.env.OCR_API_KEY || "";

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "VIEWER");
  const doc = await prisma.familyDocument.findFirst({
    where: { id: docId, familyId: id, deletedAt: null },
    select: { ocrStatus: true, ocrText: true },
  });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");
  return ok({
    ocrStatus: doc.ocrStatus,
    hasText: Boolean(doc.ocrText),
    externalServiceConfigured: Boolean(OCR_API_URL && OCR_API_KEY),
    notice: "OCR 文本仅供人工校对，不会自动写入已核实的亲属关系。",
  });
});

/**
 * OCR 文本入口：
 * 1) 传入 text —— 人工录入或外部识别结果，直接保存为待校对文本（完全可用，无需外部服务）；
 * 2) auto: true —— 调用配置的外部 OCR 服务；未配置凭证时返回明确依赖错误，不伪造识别结果。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, docId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id);
  const data = await parseBody(schema, req);
  const doc = await prisma.familyDocument.findFirst({ where: { id: docId, familyId: id, deletedAt: null } });
  if (!doc) throw new ApiError(404, "档案不存在", "NOT_FOUND");

  let text = data.text?.trim() ?? "";
  if (!text && data.auto) {
    if (!OCR_API_URL || !OCR_API_KEY) {
      throw new ApiError(
        503,
        "未配置外部 OCR 服务（OCR_API_URL / OCR_API_KEY），无法自动识别。可先人工录入识别文本并校对。",
        "OCR_NOT_CONFIGURED",
      );
    }
    const object = await getObject(doc.storageKey);
    if (!object) throw new ApiError(404, "源文件已丢失", "FILE_MISSING");
    let recognized = "";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(OCR_API_URL, {
        method: "POST",
        headers: { "Content-Type": doc.mimeType, Authorization: `Bearer ${OCR_API_KEY}` },
        body: new Uint8Array(object.bytes),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`OCR 服务返回 ${res.status}`);
      const payload = await res.json() as { text?: string };
      recognized = typeof payload.text === "string" ? payload.text.slice(0, 200000) : "";
    } catch (err) {
      await prisma.familyDocument.update({ where: { id: docId }, data: { ocrStatus: "FAILED" } });
      throw new ApiError(502, `外部 OCR 服务调用失败：${err instanceof Error ? err.message : "未知错误"}`, "OCR_FAILED");
    }
    text = recognized;
  }
  if (!text) throw new ApiError(400, "没有可保存的识别文本", "NO_TEXT");

  const updated = await prisma.familyDocument.update({
    where: { id: docId },
    data: { ocrText: text, ocrStatus: "DONE" },
  });
  await audit(req, user!.id, "document.ocr", "family_document", docId, {
    after: { source: data.auto ? "external-service" : "manual", length: text.length },
  });
  return ok({
    ocrStatus: updated.ocrStatus,
    length: text.length,
    notice: "文本已保存为待人工校对的识别结果，不会自动创建或核实任何亲属关系。",
  });
});

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyReview, assertFamilyWrite } from "@/lib/permissions";
import { validateUpload } from "@/lib/upload";
import { parseGEDCOM, parseCSV, parseJSON, buildImportReport, type ParsedData } from "@/lib/genealogy-io";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

/** 历史导入任务（仅显示报告摘要，不回传完整 payload）。 */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyReview(user, id);
  const jobs = await prisma.importJob.findMany({
    where: { familyId: id }, orderBy: { createdAt: "desc" }, take: 20,
    select: { id: true, format: true, fileName: true, status: true, createdAt: true, completedAt: true, report: true },
  });
  return ok(jobs);
});

/**
 * 解析导入文件并生成报告，不写入任何人物或关系。
 * 用户必须查看报告后显式调用 /import/[jobId]/commit 才会落库。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyWrite(user, id);
  if (!access.level) throw new ApiError(403, "无权导入", "FORBIDDEN");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "请选择导入文件", "NO_FILE");
  const upload = await validateUpload(file);
  if (![".ged", ".csv", ".json", ".txt"].includes(upload.ext)) {
    throw new ApiError(400, `不支持的导入格式：${upload.ext}`, "UNSUPPORTED_FORMAT");
  }
  const text = upload.bytes.toString("utf8");
  if (!text.trim()) throw new ApiError(400, "导入文件为空", "EMPTY_FILE");

  let parsed: ParsedData;
  let format: "GEDCOM551" | "GEDCOM70" | "CSV" | "JSON";
  try {
    if (upload.ext === ".csv") { parsed = parseCSV(text); format = "CSV"; }
    else if (upload.ext === ".json") { parsed = parseJSON(text); format = "JSON"; }
    else {
      parsed = parseGEDCOM(text);
      format = /VERS\s+7\.0/.test(text.slice(0, 1000)) ? "GEDCOM70" : "GEDCOM551";
    }
  } catch (err) {
    throw new ApiError(400, `文件解析失败：${err instanceof Error ? err.message : "未知错误"}`, "PARSE_FAILED");
  }

  const existing = await prisma.familyMember.findMany({
    where: { familyId: id, deletedAt: null },
    select: { id: true, surnameText: true, givenName: true, birthYear: true },
  });
  const report = buildImportReport(format, upload.fileName, parsed, existing);

  const job = await prisma.importJob.create({
    data: {
      familyId: id, userId: user!.id, format, fileName: upload.fileName,
      status: report.ready ? "QUEUED" : "FAILED",
      report: report as unknown as Prisma.InputJsonValue,
      payload: { persons: parsed.persons, relations: parsed.relations } as unknown as Prisma.InputJsonValue,
    },
  });
  await audit(req, user!.id, "family.import.preview", "import_job", job.id, {
    after: { format, fileName: upload.fileName, persons: parsed.persons.length, relations: parsed.relations.length },
  });
  return ok({ jobId: job.id, report }, 201);
});

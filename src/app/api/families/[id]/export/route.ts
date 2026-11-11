import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { route, ApiError, assertSameOrigin } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead } from "@/lib/permissions";
import {
  buildCSV, buildJSON, buildGEDCOM, buildSVG, type ExportBundle,
} from "@/lib/genealogy-io";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const FORMATS = ["JSON", "CSV", "GEDCOM551", "GEDCOM70", "PDF", "PNG", "SVG"] as const;
type Format = (typeof FORMATS)[number];

const CONTENT_TYPES: Record<Format, string> = {
  JSON: "application/json; charset=utf-8",
  CSV: "text/csv; charset=utf-8",
  GEDCOM551: "text/plain; charset=utf-8",
  GEDCOM70: "text/plain; charset=utf-8",
  SVG: "image/svg+xml; charset=utf-8",
  PNG: "image/png",
  PDF: "application/pdf",
};

async function loadBundle(familyId: string): Promise<ExportBundle> {
  const [family, members, relationships] = await Promise.all([
    prisma.family.findFirst({ where: { id: familyId, deletedAt: null } }),
    prisma.familyMember.findMany({
      where: { familyId, deletedAt: null },
      orderBy: [{ generationNumber: "asc" }, { birthYear: "asc" }],
      // 明确挑选字段：敏感加密字段与创建者信息一律不导出
      select: {
        id: true, surnameText: true, givenName: true, courtesyName: true, alias: true,
        gender: true, birthDateText: true, birthYear: true, deathDateText: true, deathYear: true,
        isLiving: true, generationNumber: true, generationChar: true, generationConfirmed: true,
        branchId: true, biography: true, visibility: true, verification: true,
      },
    }),
    prisma.familyRelationship.findMany({
      where: { familyId, deletedAt: null },
      select: {
        fromPersonId: true, toPersonId: true, type: true, subtype: true,
        verification: true, startDateText: true, notes: true,
      },
    }),
  ]);
  if (!family) throw new ApiError(404, "家族不存在", "NOT_FOUND");
  return {
    family: {
      id: family.id, name: family.name, surnameText: family.surnameText,
      ancestralHome: family.ancestralHome, hallName: family.hallName,
      description: family.description, visibility: family.visibility,
    },
    members,
    relationships,
  };
}

async function buildPdf(svg: string, title: string): Promise<Buffer> {
  const png = await sharp(Buffer.from(svg), { density: 140 }).png().toBuffer();
  const image = await sharp(png).metadata();
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject("中华寻根 · 百家族谱导出");
  pdf.setCreator("中华寻根 · 百家族谱");
  const img = await pdf.embedPng(png);
  const margin = 24;
  const maxW = 1400;
  const maxH = 1900;
  const scale = Math.min(maxW / (image.width || 1), maxH / (image.height || 1), 1);
  const w = (image.width || 800) * scale + margin * 2;
  const h = (image.height || 600) * scale + margin * 2 + 28;
  const page = pdf.addPage([w, h]);
  page.drawImage(img, {
    x: margin, y: margin, width: (image.width || 800) * scale, height: (image.height || 600) * scale,
  });
  return Buffer.from(await pdf.save());
}

/**
 * 导出整份族谱。仅家族协作者可导出，避免公开访客批量抓取人物与家庭资料。
 * 请求需带 Origin（同源），并会记录 ExportJob 与审计日志。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  if (!access.level) {
    throw new ApiError(403, "只有家族协作者可以导出族谱数据", "EXPORT_FORBIDDEN");
  }
  const format = (req.nextUrl.searchParams.get("format") || "JSON").toUpperCase() as Format;
  if (!FORMATS.includes(format)) throw new ApiError(400, `不支持的导出格式：${format}`, "INVALID_FORMAT");

  const bundle = await loadBundle(id);
  const svg = ["SVG", "PNG", "PDF"].includes(format) ? buildSVG(bundle) : "";
  let body: Buffer;
  switch (format) {
    case "JSON": body = Buffer.from(buildJSON(bundle), "utf8"); break;
    case "CSV": body = Buffer.from(buildCSV(bundle), "utf8"); break;
    case "GEDCOM551": body = Buffer.from(buildGEDCOM(bundle, "5.5.1"), "utf8"); break;
    case "GEDCOM70": body = Buffer.from(buildGEDCOM(bundle, "7.0"), "utf8"); break;
    case "SVG": body = Buffer.from(svg, "utf8"); break;
    case "PNG": body = await sharp(Buffer.from(svg), { density: 140 }).png().toBuffer(); break;
    case "PDF": body = await buildPdf(svg, bundle.family.name); break;
  }

  const ext = { JSON: "json", CSV: "csv", GEDCOM551: "ged", GEDCOM70: "ged", SVG: "svg", PNG: "png", PDF: "pdf" }[format];
  const fileName = `xungen-${id.slice(0, 8)}.${ext}`;
  await prisma.exportJob.create({
    data: {
      familyId: id, userId: user!.id, format, status: "COMPLETED",
      options: { members: bundle.members.length, relationships: bundle.relationships.length, bytes: body.byteLength },
      completedAt: new Date(),
    },
  });
  await audit(req, user!.id, "family.export", "family", id, { after: { format, bytes: body.byteLength } });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

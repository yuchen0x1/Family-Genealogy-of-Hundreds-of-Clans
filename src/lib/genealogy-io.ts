/**
 * 族谱导入导出引擎（纯函数，不访问数据库）。
 *
 * 纪律：
 * - 导入的关系一律标记为「未核实」，绝不自动认定血缘或合并同名人物。
 * - 导入前必须生成报告（解析统计、缺失字段、重复、冲突、与现有数据的疑似匹配），由用户确认后才写入。
 * - 导出不包含人物加密敏感字段，也不包含私有族谱中未主动公开的内容给无权访问者。
 */
import { layoutGraph, type LayoutNode, type LayoutEdge } from "@/lib/graph-layout";

export type ExportPerson = {
  id: string; surnameText: string; givenName: string; courtesyName?: string | null;
  alias?: string | null; gender: string; birthDateText?: string | null; birthYear?: number | null;
  deathDateText?: string | null; deathYear?: number | null; isLiving: boolean;
  generationNumber?: number | null; generationChar?: string | null; generationConfirmed?: boolean;
  branchId?: string | null; biography?: string | null; visibility: string; verification?: string;
};
export type ExportRelation = {
  fromPersonId: string; toPersonId: string; type: string; subtype: string;
  verification: string; startDateText?: string | null; notes?: string | null;
};
export type ExportBundle = {
  family: { id: string; name: string; surnameText: string; ancestralHome?: string | null; hallName?: string | null; description?: string | null; visibility: string };
  members: ExportPerson[];
  relationships: ExportRelation[];
};

export type ParsedPerson = {
  externalId: string; surnameText: string; givenName: string; gender: string;
  birthYear: number | null; deathYear: number | null; isLiving: boolean;
  birthDateText: string | null; deathDateText: string | null;
  generationNumber: number | null; biography: string | null;
};
export type ParsedRelation = {
  fromExternalId: string; toExternalId: string; type: string; subtype: string; notes: string | null;
};
export type ParsedData = { persons: ParsedPerson[]; relations: ParsedRelation[]; warnings: string[] };

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCSV(bundle: ExportBundle): string {
  const head = ["id", "surnameText", "givenName", "courtesyName", "alias", "gender", "birthDateText", "birthYear", "deathDateText", "deathYear", "isLiving", "generationNumber", "generationChar", "generationConfirmed", "branchId", "visibility", "verification", "biography"];
  const lines = [head.join(",")];
  for (const p of bundle.members) {
    lines.push([
      p.id, p.surnameText, p.givenName, p.courtesyName, p.alias, p.gender,
      p.birthDateText, p.birthYear, p.deathDateText, p.deathYear, p.isLiving,
      p.generationNumber, p.generationChar, p.generationConfirmed, p.branchId,
      p.visibility, p.verification, p.biography,
    ].map(esc).join(","));
  }
  // BOM 便于 Excel 正确识别 UTF-8
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildJSON(bundle: ExportBundle): string {
  return JSON.stringify({
    format: "zhonghua-xungen.genealogy",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notice: "本文件不包含人物加密敏感字段。导入后所有关系默认标记为未核实，需人工确认。",
    family: bundle.family,
    members: bundle.members,
    relationships: bundle.relationships,
  }, null, 2);
}

function gedcomDate(p: ExportPerson, kind: "BIRT" | "DEAT"): string[] {
  const text = kind === "BIRT" ? p.birthDateText : p.deathDateText;
  const year = kind === "BIRT" ? p.birthYear : p.deathYear;
  const value = text || (year ? String(year) : "");
  if (!value) return [];
  return [`1 ${kind}`, `2 DATE ${value}`];
}

/** GEDCOM 5.5.1 / 7.0 导出（LINEAGE-LINKED），UTF-8，xref 由 UUID 映射为 @I<n>@。 */
export function buildGEDCOM(bundle: ExportBundle, version: "5.5.1" | "7.0" = "5.5.1"): string {
  const xref = new Map<string, string>();
  bundle.members.forEach((p, i) => xref.set(p.id, `I${i + 1}`));
  const lines: string[] = [
    "0 HEAD",
    "1 SOUR 中华寻根·百家族谱",
    "1 GEDC",
    `2 VERS ${version}`,
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    ...(version === "7.0" ? ["1 SCHMA", "2 TAG _XUNGEN https://xungen.local/schema/genealogy"] : []),
    `1 NOTE ${bundle.family.name}；导出自中华寻根平台，关系核实状态见每条记录的 NOTE。`,
  ];

  for (const p of bundle.members) {
    lines.push(`0 @${xref.get(p.id)}@ INDI`);
    lines.push(`1 NAME ${p.surnameText}/${p.givenName}/`);
    lines.push(`2 GIVN ${p.givenName}`);
    lines.push(`2 SURN ${p.surnameText}`);
    if (p.courtesyName) lines.push(`1 NAME ${p.courtesyName}`, "2 TYPE aka");
    if (p.alias) lines.push(`1 ALIA ${p.alias}`);
    lines.push(`1 SEX ${p.gender === "MALE" ? "M" : p.gender === "FEMALE" ? "F" : "U"}`);
    lines.push(...gedcomDate(p, "BIRT"));
    if (!p.isLiving) lines.push(...gedcomDate(p, "DEAT"));
    if (p.generationNumber) lines.push(`1 _GEN ${p.generationNumber}`);
    if (p.generationChar) lines.push(`1 _GENCHAR ${p.generationChar}`);
    if (p.biography) {
      const chunks = p.biography.replace(/[\r\n]+/g, " ").match(/.{1,180}/g) ?? [];
      chunks.slice(0, 5).forEach((c, i) => lines.push(i === 0 ? `1 NOTE ${c}` : `2 CONT ${c}`));
    }
    lines.push(`1 _XUNGEN_VISIBILITY ${p.visibility}`);
    if (p.verification) lines.push(`1 _XUNGEN_VERIFICATION ${p.verification}`);
  }

  const spouseRels = bundle.relationships.filter((r) => r.type === "SPOUSE");
  const childRels = bundle.relationships.filter((r) => r.type === "PARENT_CHILD");
  const famIdByParents = new Map<string, string>();
  let famSeq = 0;

  for (const r of spouseRels) {
    const key = [r.fromPersonId, r.toPersonId].sort().join("|");
    if (famIdByParents.has(key)) continue;
    famIdByParents.set(key, `F${++famSeq}`);
  }
  // 没有配偶关系的亲子关系也要建立 FAM
  for (const r of childRels) {
    const father = r.fromPersonId;
    const key = `solo|${father}|${r.toPersonId}`;
    if (!famIdByParents.has(key)) famIdByParents.set(key, `F${++famSeq}`);
  }

  const famLines = new Map<string, string[]>();
  const ensureFam = (id: string) => {
    if (!famLines.has(id)) famLines.set(id, [`0 @${id}@ FAM`]);
    return famLines.get(id)!;
  };
  for (const r of spouseRels) {
    const key = [r.fromPersonId, r.toPersonId].sort().join("|");
    const id = famIdByParents.get(key)!;
    const f = ensureFam(id);
    if (!f.some((l) => l.startsWith("1 HUSB"))) f.push(`1 HUSB @${xref.get(r.fromPersonId)}@`);
    if (!f.some((l) => l.startsWith("1 WIFE"))) f.push(`1 WIFE @${xref.get(r.toPersonId)}@`);
    if (r.notes) f.push(`1 NOTE ${r.notes.slice(0, 180)}`);
  }
  for (const r of childRels) {
    let id = famIdByParents.get([r.fromPersonId, r.toPersonId].sort().join("|"));
    if (!id) {
      // 找以该父/母为 HUSB 或 WIFE 的 FAM
      for (const [fid, linesOfFam] of famLines) {
        const from = `@${xref.get(r.fromPersonId)}@`;
        if (linesOfFam.some((l) => l === `1 HUSB ${from}` || l === `1 WIFE ${from}`)) { id = fid; break; }
      }
    }
    if (!id) {
      const key = `solo|${r.fromPersonId}|${r.toPersonId}`;
      id = famIdByParents.get(key) ?? `F${++famSeq}`;
      famIdByParents.set(key, id);
      const f = ensureFam(id);
      f.push(`1 HUSB @${xref.get(r.fromPersonId)}@`);
    }
    ensureFam(id).push(`1 CHIL @${xref.get(r.toPersonId)}@`);
    if (r.subtype === "ADOPTIVE") ensureFam(id).push("2 PEDI adopted");
  }
  for (const f of famLines.values()) lines.push(...f);
  lines.push("0 TRLR");
  return `${lines.join("\r\n")}\r\n`;
}

/** 生成 SVG 家族树（与前端图谱共用同一布局引擎，保证结构一致）。 */
export function buildSVG(bundle: ExportBundle): string {
  const nodes: LayoutNode[] = bundle.members.map((p) => ({
    id: p.id, name: `${p.surnameText}${p.givenName}`, gender: p.gender,
    birthYear: p.birthYear ?? null, generationNumber: p.generationNumber ?? null,
    branchId: p.branchId ?? null,
  }));
  const edges: LayoutEdge[] = bundle.relationships.map((r, i) => ({
    id: `e${i}`, source: r.fromPersonId, target: r.toPersonId,
    type: r.type, subtype: r.subtype, label: "",
  }));
  const layout = layoutGraph(nodes, edges, { orientation: "vertical" });
  const padding = 40;
  const w = layout.width + padding * 2;
  const h = layout.height + padding * 2;
  const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const edgePaths = layout.edges.map((e) => `<path d="${e.path}" stroke="${e.color}" stroke-width="1.6" fill="none" ${e.dashed ? 'stroke-dasharray="6 4"' : ""}/>`).join("");
  const nodeShapes = layout.nodes.map((n) => {
    const name = xmlEscape(n.name.length > 9 ? `${n.name.slice(0, 9)}…` : n.name);
    return `<g><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="#ffffff" stroke="#e2ddd0"/>` +
      `<rect x="${n.x}" y="${n.y}" width="5" height="${n.height}" rx="2.5" fill="${n.gender === "FEMALE" ? "#a63d2f" : "#1b2a41"}"/>` +
      `<text x="${n.x + 16}" y="${n.y + 28}" font-size="13" font-family="serif" fill="#191b1d">${name}</text>` +
      `<text x="${n.x + 16}" y="${n.y + 46}" font-size="10" fill="#7b837c">${n.generationNumber ? `第 ${n.generationNumber} 世` : "世系待确认"}${n.birthYear ? ` · ${n.birthYear}` : ""}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#faf9f5"/>` +
    `<text x="${padding}" y="24" font-size="14" font-family="serif" fill="#1b2a41">${xmlEscape(bundle.family.name)} · 家族关系图（导出）</text>` +
    `<g transform="translate(${padding},${padding})">${edgePaths}${nodeShapes}</g></svg>`;
}

// ============================ 解析 ============================

type GedLine = { level: number; xref: string | null; tag: string; value: string };

function parseGedLine(raw: string): GedLine | null {
  const line = raw.replace(/^\uFEFF/, "").trim();
  if (!line) return null;
  const m = line.match(/^(\d+)\s+(?:@([^@]+)@\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);
  if (!m) return null;
  return { level: Number(m[1]), xref: m[2] ?? null, tag: m[3].toUpperCase(), value: (m[4] ?? "").trim() };
}

export function parseGEDCOM(text: string): ParsedData {
  const lines = text.split(/\r?\n/).map(parseGedLine).filter((x): x is GedLine => x !== null);
  const warnings: string[] = [];
  const persons = new Map<string, ParsedPerson>();
  const indiRecords = new Map<string, Array<{ level: number; tag: string; value: string }>>();
  const famRecords = new Map<string, Array<{ level: number; tag: string; value: string }>>();
  const version = lines.find((l) => l.tag === "VERS")?.value ?? "未知";
  warnings.push(`检测到 GEDCOM 版本：${version}；按 LINEAGE-LINKED 通用结构解析。`);

  let current: { kind: "INDI" | "FAM"; id: string } | null = null;
  for (const l of lines) {
    if (l.level === 0 && l.xref && (l.tag === "INDI" || l.tag === "FAM")) {
      current = { kind: l.tag, id: l.xref };
      (l.tag === "INDI" ? indiRecords : famRecords).set(l.xref, []);
      continue;
    }
    if (l.level === 0) { current = null; continue; }
    if (!current) continue;
    (current.kind === "INDI" ? indiRecords : famRecords).get(current.id)!.push({ level: l.level, tag: l.tag, value: l.value });
  }

  const yearOf = (value: string): number | null => {
    const m = value.match(/(-?\d{1,4})/);
    if (!m) return null;
    const n = Number(m[1]);
    return n > 0 && n < 3000 ? n : null;
  };

  for (const [id, rows] of indiRecords) {
    const nameRow = rows.find((r) => r.tag === "NAME" && r.level === 1);
    const givn = rows.find((r) => r.tag === "GIVN")?.value;
    const surn = rows.find((r) => r.tag === "SURN")?.value;
    let surnameText = surn ?? "";
    let givenName = givn ?? "";
    if (nameRow) {
      const raw = nameRow.value;
      const m = raw.match(/^(.*?)\/(.*?)\/(.*)$/);
      if (m) {
        surnameText = surnameText || m[1].trim();
        givenName = givenName || `${m[2].trim()}${m[3].trim()}`.trim();
      } else if (!givenName) {
        givenName = raw.trim();
      }
    }
    const birt = rows.find((r) => r.tag === "BIRT");
    const deat = rows.find((r) => r.tag === "DEAT");
    const birtDate = rows.find((r, i) => r.tag === "DATE" && i > 0 && rows[i - 1].tag === "BIRT")?.value ?? null;
    const deatDate = rows.find((r, i) => r.tag === "DATE" && i > 0 && rows[i - 1].tag === "DEAT")?.value ?? null;
    const sex = rows.find((r) => r.tag === "SEX")?.value?.toUpperCase();
    const gen = rows.find((r) => r.tag === "_GEN")?.value;
    const notes = rows.filter((r) => r.tag === "NOTE" && r.level === 1).map((r) => r.value).join(" ");
    persons.set(id, {
      externalId: id,
      surnameText: surnameText || "未知",
      givenName: givenName || "（未填写名字）",
      gender: sex === "M" ? "MALE" : sex === "F" ? "FEMALE" : "UNKNOWN",
      birthYear: yearOf(birtDate ?? ""), deathYear: yearOf(deatDate ?? ""),
      isLiving: !deat && !deatDate,
      birthDateText: birtDate, deathDateText: deatDate,
      generationNumber: gen ? Number(gen) || null : null,
      biography: notes || null,
    });
    if (birt && !birtDate) warnings.push(`人物 ${id} 有 BIRT 但缺少日期文本，仅保留年份（若有）。`);
  }

  const relations: ParsedRelation[] = [];
  const xrefOf = (v: string) => v.replace(/@/g, "").trim();
  for (const [famId, rows] of famRecords) {
    const husb = rows.find((r) => r.tag === "HUSB")?.value;
    const wife = rows.find((r) => r.tag === "WIFE")?.value;
    const children = rows.filter((r) => r.tag === "CHIL").map((r) => r.value);
    const adoptive = rows.some((r) => r.tag === "PEDI" && /adopt|foster/i.test(r.value));
    if (husb && wife) {
      relations.push({
        fromExternalId: xrefOf(husb), toExternalId: xrefOf(wife), type: "SPOUSE",
        subtype: "MARRIAGE", notes: `FAM ${famId} 导入`,
      });
    }
    for (const parent of [husb, wife].filter(Boolean) as string[]) {
      for (const child of children) {
        relations.push({
          fromExternalId: xrefOf(parent), toExternalId: xrefOf(child),
          type: adoptive ? "ADOPTION" : "PARENT_CHILD",
          subtype: adoptive ? "ADOPTIVE" : "BIOLOGICAL",
          notes: `FAM ${famId} 导入，需人工核实`,
        });
      }
    }
  }
  if (indiRecords.size === 0) warnings.push("未解析到 INDI 人物记录，请确认文件是标准 GEDCOM。");
  return { persons: Array.from(persons.values()), relations, warnings };
}

/** 轻量 CSV 解析，支持引号包裹、换行转义与 BOM。 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseCSV(text: string): ParsedData {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { persons: [], relations: [], warnings: ["CSV 没有数据行。"] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name.toLowerCase());
  const get = (r: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const warnings: string[] = [];
  if (idx("surnameText") < 0 && idx("姓氏") < 0) warnings.push("缺少 surnameText/姓氏 列，将使用默认值。");
  if (idx("givenName") < 0 && idx("名字") < 0) warnings.push("缺少 givenName/名字 列，无法正确识别人物。");
  const persons: ParsedPerson[] = rows.slice(1).map((r, i) => {
    const num = (v: string) => (v && Number.isFinite(Number(v)) ? Number(v) : null);
    const isLivingRaw = get(r, "isLiving") || get(r, "在世");
    return {
      externalId: get(r, "id") || `CSV${i + 1}`,
      surnameText: get(r, "surnameText") || get(r, "姓氏") || "未知",
      givenName: get(r, "givenName") || get(r, "名字") || `（第 ${i + 2} 行未填名字）`,
      gender: (() => { const g = (get(r, "gender") || get(r, "性别")).toUpperCase(); return g === "MALE" || g === "M" || g === "男" ? "MALE" : g === "FEMALE" || g === "F" || g === "女" ? "FEMALE" : "UNKNOWN"; })(),
      birthYear: num(get(r, "birthYear")), deathYear: num(get(r, "deathYear")),
      isLiving: isLivingRaw ? !/^(false|0|no|否|已故)$/i.test(isLivingRaw) : !get(r, "deathYear"),
      birthDateText: get(r, "birthDateText") || null, deathDateText: get(r, "deathDateText") || null,
      generationNumber: num(get(r, "generationNumber")), biography: get(r, "biography") || null,
    };
  });
  const relations: ParsedRelation[] = [];
  for (const col of ["fatherId", "motherId", "spouseId"]) {
    if (idx(col) < 0) continue;
    rows.slice(1).forEach((r, i) => {
      const target = get(r, col);
      if (!target) return;
      relations.push({
        fromExternalId: target, toExternalId: persons[i].externalId,
        type: col === "spouseId" ? "SPOUSE" : "PARENT_CHILD",
        subtype: col === "spouseId" ? "MARRIAGE" : "BIOLOGICAL",
        notes: `CSV ${col} 列导入，需人工核实`,
      });
    });
    warnings.push(`检测到 ${col} 列，已生成候选关系（导入后均为未核实）。`);
  }
  return { persons, relations, warnings };
}

export function parseJSON(text: string): ParsedData {
  const warnings: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("JSON 格式无效"); }
  if (!raw || typeof raw !== "object") throw new Error("JSON 内容不是对象");
  const obj = raw as Record<string, unknown>;
  const members = Array.isArray(obj.members) ? obj.members : Array.isArray(obj.persons) ? obj.persons : null;
  if (!members) throw new Error("JSON 缺少 members / persons 数组");
  const persons: ParsedPerson[] = members.map((m, i) => {
    const p = m as Record<string, unknown>;
    const str = (k: string) => (typeof p[k] === "string" ? String(p[k]) : null);
    const num = (k: string) => (typeof p[k] === "number" ? Number(p[k]) : null);
    return {
      externalId: str("id") || str("externalId") || `JSON${i + 1}`,
      surnameText: str("surnameText") || str("姓氏") || "未知",
      givenName: str("givenName") || str("名字") || `（第 ${i + 1} 位未填名字）`,
      gender: ["MALE", "FEMALE", "UNKNOWN"].includes(String(p.gender)) ? String(p.gender) : "UNKNOWN",
      birthYear: num("birthYear"), deathYear: num("deathYear"),
      isLiving: typeof p.isLiving === "boolean" ? p.isLiving : !num("deathYear"),
      birthDateText: str("birthDateText"), deathDateText: str("deathDateText"),
      generationNumber: num("generationNumber"), biography: str("biography"),
    };
  });
  const rels = (Array.isArray(obj.relationships) ? obj.relationships : Array.isArray(obj.relations) ? obj.relations : []) as Array<Record<string, unknown>>;
  const relations: ParsedRelation[] = rels.map((r) => ({
    fromExternalId: String(r.fromPersonId ?? r.fromExternalId ?? ""),
    toExternalId: String(r.toPersonId ?? r.toExternalId ?? ""),
    type: ["PARENT_CHILD", "SPOUSE", "SIBLING", "ADOPTION"].includes(String(r.type)) ? String(r.type) : "PARENT_CHILD",
    subtype: typeof r.subtype === "string" ? r.subtype : "BIOLOGICAL",
    notes: "JSON 导入，需人工核实",
  }));
  if (typeof obj.notice === "string") warnings.push(String(obj.notice));
  return { persons, relations, warnings };
}

export type ImportReport = {
  format: string; fileName: string;
  counts: { persons: number; relations: number };
  missingFields: Array<{ row: number; field: string; note: string }>;
  duplicates: Array<{ name: string; rows: number[]; reason: string }>;
  conflicts: Array<{ type: string; detail: string }>;
  existingMatches: Array<{ name: string; existingId: string; reason: string }>;
  warnings: string[];
  ready: boolean;
};

export function buildImportReport(
  format: string, fileName: string, parsed: ParsedData,
  existing: Array<{ id: string; surnameText: string; givenName: string; birthYear: number | null }>,
): ImportReport {
  const missingFields: ImportReport["missingFields"] = [];
  const duplicates: ImportReport["duplicates"] = [];
  const conflicts: ImportReport["conflicts"] = [];
  const existingMatches: ImportReport["existingMatches"] = [];
  const known = new Set(parsed.persons.map((p) => p.externalId));
  // 预建姓名索引，避免每个导入人物线性扫描全部现有人物（大文件会打满 CPU）
  const existingByName = new Map<string, Array<{ id: string; birthYear: number | null }>>();
  for (const e of existing) {
    const name = `${e.surnameText}${e.givenName}`;
    const list = existingByName.get(name);
    if (list) list.push({ id: e.id, birthYear: e.birthYear });
    else existingByName.set(name, [{ id: e.id, birthYear: e.birthYear }]);
  }

  parsed.persons.forEach((p, i) => {
    const row = i + 1;
    if (!p.givenName || p.givenName.includes("未填")) missingFields.push({ row, field: "givenName", note: "名字缺失，导入后需补充" });
    if (!p.surnameText || p.surnameText === "未知") missingFields.push({ row, field: "surnameText", note: "姓氏缺失" });
    if (p.birthYear === null && p.birthDateText === null) missingFields.push({ row, field: "birthYear", note: "缺少出生年份，时间轴与世代排序可能不准确" });
    if (p.gender === "UNKNOWN") missingFields.push({ row, field: "gender", note: "性别未知，亲属称谓可能无法确定" });
    for (const e of existingByName.get(`${p.surnameText}${p.givenName}`) ?? []) {
      if (p.birthYear === null || e.birthYear === null || e.birthYear === p.birthYear) {
        existingMatches.push({ name: `${p.surnameText}${p.givenName}`, existingId: e.id, reason: "姓名与出生年与现有人物一致（仅提示，绝不自动合并）" });
      }
    }
  });

  const seen = new Map<string, number[]>();
  parsed.persons.forEach((p, i) => {
    const key = `${p.surnameText}${p.givenName}|${p.birthYear ?? ""}`;
    seen.set(key, [...(seen.get(key) ?? []), i + 1]);
  });
  for (const [key, rows] of seen) {
    if (rows.length > 1) duplicates.push({ name: key.split("|")[0], rows, reason: "文件内姓名与出生年重复，可能是重复录入或同名人物" });
  }

  const relationKeys = new Set<string>();
  for (const r of parsed.relations) {
    if (!known.has(r.fromExternalId) || !known.has(r.toExternalId)) {
      conflicts.push({ type: "DANGLING_REFERENCE", detail: `关系引用了文件中不存在的人物：${r.fromExternalId} → ${r.toExternalId}` });
      continue;
    }
    if (r.fromExternalId === r.toExternalId) {
      conflicts.push({ type: "SELF_RELATION", detail: `人物 ${r.fromExternalId} 与自身建立关系，将被跳过` });
      continue;
    }
    const key = r.type === "SPOUSE" ? [r.fromExternalId, r.toExternalId].sort().join("|") : `${r.fromExternalId}>${r.toExternalId}`;
    if (relationKeys.has(key)) conflicts.push({ type: "DUPLICATE_RELATION", detail: `重复关系：${r.fromExternalId} → ${r.toExternalId}` });
    relationKeys.add(key);
  }

  const warnings = [
    ...parsed.warnings,
    "导入的关系一律标记为「未核实」，不会参与亲属称谓计算，需人工逐条确认。",
    "系统不会因同姓或同名合并人物；重复项会在报告中列出，由用户决定是否跳过。",
  ];
  if (existingMatches.length) warnings.push(`发现 ${existingMatches.length} 条与现有资料疑似匹配，请人工确认，切勿直接合并。`);

  return {
    format, fileName,
    counts: { persons: parsed.persons.length, relations: parsed.relations.length },
    missingFields, duplicates, conflicts, existingMatches, warnings,
    ready: parsed.persons.length > 0,
  };
}

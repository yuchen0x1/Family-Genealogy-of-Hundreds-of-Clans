import { describe, it, expect } from "vitest";
import {
  buildCSV, buildJSON, buildGEDCOM, buildSVG, parseGEDCOM, parseCSV, parseJSON, buildImportReport,
  type ExportBundle,
} from "@/lib/genealogy-io";

const bundle: ExportBundle = {
  family: { id: "f1", name: "测试陈氏族谱", surnameText: "陈", ancestralHome: "河南许昌", hallName: "颍川堂", visibility: "PRIVATE" },
  members: [
    { id: "p1", surnameText: "陈", givenName: "祖父", gender: "MALE", birthYear: 1900, deathYear: 1980, isLiving: false, generationNumber: 1, visibility: "PRIVATE" },
    { id: "p2", surnameText: "陈", givenName: "祖母", gender: "FEMALE", birthYear: 1905, deathYear: 1990, isLiving: false, generationNumber: 1, visibility: "PRIVATE" },
    { id: "p3", surnameText: "陈", givenName: "父亲", gender: "MALE", birthYear: 1935, isLiving: false, deathYear: 2010, generationNumber: 2, visibility: "PRIVATE" },
  ],
  relationships: [
    { fromPersonId: "p1", toPersonId: "p2", type: "SPOUSE", subtype: "MARRIAGE", verification: "VERIFIED" },
    { fromPersonId: "p1", toPersonId: "p3", type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED" },
    { fromPersonId: "p2", toPersonId: "p3", type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED" },
  ],
};

describe("导出", () => {
  it("CSV 带 UTF-8 BOM 且包含表头与人物", () => {
    const csv = buildCSV(bundle);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("surnameText,givenName");
    expect(csv).toContain("陈,祖父");
  });

  it("CSV 正确转义含逗号与引号的传记", () => {
    const b = { ...bundle, members: [{ ...bundle.members[0], biography: '生于甲年，"号"逸民' }] };
    expect(buildCSV(b)).toContain('"生于甲年，""号""逸民"');
  });

  it("JSON 携带格式声明与隐私提示", () => {
    const json = JSON.parse(buildJSON(bundle));
    expect(json.format).toBe("zhonghua-xungen.genealogy");
    expect(json.members).toHaveLength(3);
    expect(json.notice).toContain("未核实");
    expect(JSON.stringify(json)).not.toContain("sensitiveDataEncrypted");
  });

  it("GEDCOM 5.5.1 结构完整", () => {
    const ged = buildGEDCOM(bundle, "5.5.1");
    expect(ged).toContain("0 HEAD");
    expect(ged).toContain("2 VERS 5.5.1");
    expect(ged).toContain("1 CHAR UTF-8");
    expect(ged).toContain("@I1@ INDI");
    expect(ged).toContain("@F1@ FAM");
    expect(ged).toContain("1 CHIL @I3@");
    expect(ged.trim().endsWith("0 TRLR")).toBe(true);
  });

  it("GEDCOM 7.0 写出对应版本号", () => {
    expect(buildGEDCOM(bundle, "7.0")).toContain("2 VERS 7.0");
  });

  it("SVG 与前端布局引擎一致且包含人物姓名", () => {
    const svg = buildSVG(bundle);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain("陈祖父");
    expect(svg).toContain("</svg>");
  });
});

describe("导入解析", () => {
  it("标准 GEDCOM 姓名与日期：不颠倒姓/名，不将日当作生年", () => {
    const parsed = parseGEDCOM("0 @I1@ INDI\n1 NAME John /Smith/\n1 BIRT\n2 DATE 12 JAN 1950\n0 TRLR");
    expect(parsed.persons[0]).toMatchObject({ surnameText: "Smith", givenName: "John", birthYear: 1950 });
    expect(parseGEDCOM("0 @I1@ INDI\n1 BIRT\n2 DATE 光绪十二年").persons[0].birthYear).toBeNull();
    for (const year of [-100, 0, 1900]) {
      expect(parseGEDCOM(buildGEDCOM({ ...bundle, members: [{ ...bundle.members[0], birthYear: year }] })).persons[0].birthYear).toBe(year);
    }
  });
  it.each(["5.5.1", "7.0"] as const)("GEDCOM %s 往返不把配偶自动变成父母，保留收养及已故未知卒年", (version) => {
    const input: ExportBundle = { ...bundle, members: bundle.members.map((p) => ({ ...p, deathYear: null, deathDateText: null, isLiving: false })), relationships: [
      bundle.relationships[0], { ...bundle.relationships[1], type: "ADOPTION", subtype: "ADOPTIVE" },
    ] };
    const result = parseGEDCOM(buildGEDCOM(input, version));
    expect(result.relations).toHaveLength(2);
    expect(result.relations.filter((r) => r.type === "ADOPTION")).toEqual([expect.objectContaining({ fromExternalId: "I1", toExternalId: "I3", subtype: "ADOPTIVE" })]);
    expect(result.persons.every((p) => !p.isLiving)).toBe(true);
  });
  it("PEDI 的收养范围只属于指定子女，外部 BIRTH 不认定为生物学血缘", () => {
    const parsed = parseGEDCOM(["0 @P@ INDI", "1 NAME Parent /Test/", "0 @A@ INDI", "1 FAMC @F@", "2 PEDI ADOPTED", "0 @B@ INDI", "1 FAMC @F@", "2 PEDI BIRTH", "0 @F@ FAM", "1 HUSB @P@", "1 CHIL @A@", "1 CHIL @B@"].join("\n"));
    expect(parsed.relations).toEqual([expect.objectContaining({ toExternalId: "A", type: "ADOPTION", subtype: "ADOPTIVE" }), expect.objectContaining({ toExternalId: "B", type: "PARENT_CHILD", subtype: "UNKNOWN" })]);
  });
  it("GEDCOM 重复标识拒绝覆盖前一记录", () => {
    expect(() => parseGEDCOM("0 @A@ INDI\n1 NAME A /Test/\n0 @A@ INDI\n1 NAME B /Test/")).toThrow("标识重复");
  });
  it("保留监护与过继，未知类型不转换为血缘；缺省子类型不认定血缘", () => {
    const result = parseJSON(JSON.stringify({ members: bundle.members, relationships: [
      { type: "GUARDIANSHIP" }, { type: "SUCCESSION", subtype: "ADOPTIVE" },
      { type: "UNKNOWN" }, { type: "PARENT_CHILD" }, { type: "SPOUSE", subtype: "invalid" },
    ] }));
    expect(result.relations.map((r) => [r.type, r.subtype])).toEqual([["GUARDIANSHIP", "UNKNOWN"], ["SUCCESSION", "ADOPTIVE"], ["PARENT_CHILD", "UNKNOWN"]]);
    expect(result.warnings).toHaveLength(2);
  });
  it("人物标识重复时阻止导入，避免关系指向最后一个同标识人物", () => {
    const parsed = parseJSON(JSON.stringify({ members: [bundle.members[0], bundle.members[0]] }));
    const report = buildImportReport("JSON", "duplicate.json", parsed, []);
    expect(report.ready).toBe(false);
    expect(report.conflicts.some((c) => c.type === "DUPLICATE_ID")).toBe(true);
  });
  it("GEDCOM 导出后可解析回相同人数", () => {
    const parsed = parseGEDCOM(buildGEDCOM(bundle));
    expect(parsed.persons).toHaveLength(3);
    expect(parsed.persons[0].givenName).toBe("祖父");
    expect(parsed.persons[0].surnameText).toBe("陈");
    expect(parsed.relations.length).toBeGreaterThanOrEqual(3);
    expect(parsed.warnings.join(" ")).toContain("GEDCOM");
  });

  it("GEDCOM 中 PEDI adopted 解析为收养关系", () => {
    const ged = [
      "0 HEAD", "1 GEDC", "2 VERS 5.5.1", "1 CHAR UTF-8",
      "0 @I1@ INDI", "1 NAME 陈/养父/", "1 SEX M",
      "0 @I2@ INDI", "1 NAME 陈/养子/", "1 SEX M",
      "0 @F1@ FAM", "1 HUSB @I1@", "1 CHIL @I2@", "2 PEDI adopted",
      "0 TRLR",
    ].join("\n");
    const parsed = parseGEDCOM(ged);
    expect(parsed.relations.some((r) => r.type === "ADOPTION")).toBe(true);
  });

  it("CSV 支持 BOM、引号与 fatherId 关系列", () => {
    const csv = '\uFEFFid,surnameText,givenName,gender,birthYear,isLiving,fatherId,biography\r\n' +
      'A1,陈,祖父,MALE,1900,false,,"生于甲年，务农"\r\n' +
      'A2,陈,父亲,MALE,1930,false,A1,""\r\n';
    const parsed = parseCSV(csv);
    expect(parsed.persons).toHaveLength(2);
    expect(parsed.persons[0].biography).toBe("生于甲年，务农");
    expect(parsed.relations[0].type).toBe("PARENT_CHILD");
    expect(parsed.relations[0].fromExternalId).toBe("A1");
  });

  it("JSON 导出后可解析回人物与关系", () => {
    const parsed = parseJSON(buildJSON(bundle));
    expect(parsed.persons).toHaveLength(3);
    expect(parsed.persons[2].givenName).toBe("父亲");
    expect(parsed.relations).toHaveLength(3);
  });

  it("非法 JSON 抛出可读错误", () => {
    expect(() => parseJSON("{ not json")).toThrow();
    expect(() => parseJSON("{}")).toThrow(/members/);
  });
});

describe("导入报告", () => {
  it("检测重复、缺失字段、悬空引用与现有资料匹配", () => {
    const parsed = {
      persons: [
        { externalId: "A", surnameText: "陈", givenName: "祖父", gender: "UNKNOWN", birthYear: null, deathYear: null, isLiving: true, birthDateText: null, deathDateText: null, generationNumber: null, biography: null },
        { externalId: "B", surnameText: "陈", givenName: "祖父", gender: "MALE", birthYear: null, deathYear: null, isLiving: true, birthDateText: null, deathDateText: null, generationNumber: null, biography: null },
      ],
      relations: [
        { fromExternalId: "A", toExternalId: "MISSING", type: "PARENT_CHILD", subtype: "BIOLOGICAL", notes: null },
        { fromExternalId: "A", toExternalId: "A", type: "PARENT_CHILD", subtype: "BIOLOGICAL", notes: null },
      ],
      warnings: ["测试警告"],
    };
    const report = buildImportReport("CSV", "test.csv", parsed, [
      { id: "existing-1", surnameText: "陈", givenName: "祖父", birthYear: null },
    ]);
    expect(report.counts.persons).toBe(2);
    expect(report.duplicates).toHaveLength(1);
    expect(report.conflicts.map((c) => c.type)).toContain("DANGLING_REFERENCE");
    expect(report.conflicts.map((c) => c.type)).toContain("SELF_RELATION");
    expect(report.missingFields.some((m) => m.field === "birthYear")).toBe(true);
    expect(report.missingFields.some((m) => m.field === "gender")).toBe(true);
    expect(report.existingMatches.length).toBeGreaterThan(0);
    expect(report.warnings.join(" ")).toContain("未核实");
    expect(report.ready).toBe(true);
  });

  it("名字缺失会被列入报告字段检查", () => {
    const report = buildImportReport("CSV", "bad.csv", {
      persons: [{ externalId: "A", surnameText: "陈", givenName: "（第 2 行未填名字）", gender: "MALE", birthYear: 1900, deathYear: null, isLiving: true, birthDateText: null, deathDateText: null, generationNumber: null, biography: null }],
      relations: [], warnings: [],
    }, []);
    expect(report.missingFields.some((m) => m.field === "givenName")).toBe(true);
  });

  it("空文件不可提交", () => {
    const report = buildImportReport("JSON", "empty.json", { persons: [], relations: [], warnings: [] }, []);
    expect(report.ready).toBe(false);
  });
});

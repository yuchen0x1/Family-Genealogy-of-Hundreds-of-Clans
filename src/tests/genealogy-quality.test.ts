import { describe, expect, it } from "vitest";
import { inspectGenealogy, type QualityPerson, type QualityRelation } from "@/lib/genealogy-quality";

const person = (id: string, patch: Partial<QualityPerson> = {}): QualityPerson => ({ id, surnameText: "陈", givenName: id, birthYear: null, deathYear: null, deathDateText: null, isLiving: true, generationNumber: null, generationConfirmed: false, ...patch });
const relation = (id: string, from: string, to: string, patch: Partial<QualityRelation> = {}): QualityRelation => ({ id, fromPersonId: from, toPersonId: to, type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED", ...patch });
const now = new Date("2026-11-13T00:00:00Z");

describe("资料体检", () => {
  it("空库与未知日期不编造问题", () => {
    expect(inspectGenealogy([], [], now).totalIssues).toBe(0);
    expect(inspectGenealogy([person("a")], [], now).totalIssues).toBe(0);
  });
  it("报告年代冲突、未来年份、在世与去世资料冲突，包含公元前与零年", () => {
    const report = inspectGenealogy([person("a", { birthYear: 0, deathYear: -1 }), person("b", { birthYear: 2030 }), person("c", { deathDateText: "约清末" })], [], now);
    expect(report.issues.map((i) => i.code)).toEqual(["BIRTH_AFTER_DEATH", "LIVING_WITH_DEATH", "FUTURE_YEAR", "LIVING_WITH_DEATH"]);
  });
  it("检查关系两端、同人、对称重复与未核实状态", () => {
    const report = inspectGenealogy([person("a"), person("b")], [relation("1", "a", "missing"), relation("2", "a", "a"), relation("3", "a", "b", { type: "SPOUSE" }), relation("4", "b", "a", { type: "SPOUSE", verification: "UNVERIFIED" })], now);
    expect(report.issues.map((i) => i.code)).toEqual(["MISSING_PERSON", "SELF_RELATION", "DUPLICATE_RELATION", "UNVERIFIED_RELATION"]);
  });
  it("只对生物学亲子检查父母年代和双方已确认的世代", () => {
    const people = [person("a", { birthYear: 1980, generationNumber: 3, generationConfirmed: true }), person("b", { birthYear: 1950, generationNumber: 2, generationConfirmed: true })];
    expect(inspectGenealogy(people, [relation("1", "a", "b")], now).counts.WARNING).toBe(2);
    expect(inspectGenealogy(people, [relation("1", "a", "b", { type: "ADOPTION", subtype: "ADOPTIVE" })], now).totalIssues).toBe(0);
    expect(inspectGenealogy(people.map((p) => ({ ...p, generationConfirmed: false })), [relation("1", "a", "b")], now).issues.map((i) => i.code)).toEqual(["PARENT_BIRTH_ORDER"]);
  });
  it("父母按不同人物计数，否定关系不参与结构检查", () => {
    const people = ["a", "b", "c", "d"].map((id) => person(id));
    const rels = [relation("1", "a", "d"), relation("2", "a", "d"), relation("3", "b", "d"), relation("4", "c", "d", { verification: "REJECTED" })];
    expect(inspectGenealogy(people, rels, now).issues.some((i) => i.code === "TOO_MANY_PARENTS")).toBe(false);
    rels[3].verification = "UNVERIFIED";
    expect(inspectGenealogy(people, rels, now).issues.some((i) => i.code === "TOO_MANY_PARENTS")).toBe(true);
  });
  it("检测真实环；多路径共同祖先不是环", () => {
    const people = ["a", "b", "c", "d"].map((id) => person(id));
    const rels = [relation("1", "a", "b"), relation("2", "a", "c"), relation("3", "b", "d"), relation("4", "c", "d")];
    expect(inspectGenealogy(people, rels, now).counts.ERROR).toBe(0);
    expect(inspectGenealogy(people, [...rels, relation("5", "d", "a")], now).issues.some((i) => i.code === "BLOOD_CYCLE")).toBe(true);
  });
  it("一万代链不会溢出调用栈，限制返回条数但完整计数且优先结构异常", () => {
    const people = Array.from({ length: 10_000 }, (_, i) => person(String(i)));
    const rels = people.slice(1).map((p, i) => relation(String(i), String(i), p.id, { verification: "UNVERIFIED" }));
    rels.push(relation("cycle", "9999", "0"));
    const report = inspectGenealogy(people, rels, now, 5);
    expect(report.totalIssues).toBe(10_000);
    expect(report.issues).toHaveLength(5);
    expect(report.issues[0].code).toBe("BLOOD_CYCLE");
    expect(report.truncated).toBe(true);
  });
  it("输入不变，报告不夹带无关字段", () => {
    const people = [Object.freeze({ ...person("a", { deathYear: 1900 }), sensitiveDataEncrypted: "secret" })];
    const before = JSON.stringify(people);
    expect(JSON.stringify(inspectGenealogy(people, [], now))).not.toContain("secret");
    expect(JSON.stringify(people)).toBe(before);
  });
});

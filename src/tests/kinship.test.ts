import { describe, it, expect } from "vitest";
import {
  buildKinshipGraph,
  calculateKinship,
  getAncestors,
  getDescendants,
  detectBloodCycle,
  type KinshipPerson,
  type KinshipRelation,
} from "@/lib/kinship";

const p = (id: string, gender: "MALE" | "FEMALE" | "UNKNOWN", birthYear?: number): KinshipPerson => ({
  id, gender, birthYear: birthYear ?? null, name: id,
});

const rel = (
  from: string,
  to: string,
  type: KinshipRelation["type"] = "PARENT_CHILD",
  subtype: KinshipRelation["subtype"] = "BIOLOGICAL",
  verification: KinshipRelation["verification"] = "VERIFIED",
): KinshipRelation => ({ fromPersonId: from, toPersonId: to, type, subtype, verification });

function graph(people: KinshipPerson[], relations: KinshipRelation[], requireVerified = true) {
  return buildKinshipGraph(people, relations, { requireVerified });
}

describe("亲属称谓：直系", () => {
  const people = [p("祖父", "MALE", 1900), p("祖母", "FEMALE", 1902), p("父亲", "MALE", 1930), p("本人", "MALE", 1960), p("儿子", "MALE", 1990)];
  const relations = [
    rel("祖父", "父亲"), rel("祖母", "父亲"),
    rel("父亲", "本人"), rel("本人", "儿子"),
  ];

  it("父亲 / 儿子", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "父亲").term).toBe("父亲");
    expect(calculateKinship(g, "本人", "儿子").term).toBe("儿子");
  });

  it("祖父母 / 孙子", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "祖父").term).toContain("祖父");
    expect(calculateKinship(g, "本人", "祖母").term).toContain("祖母");
    expect(calculateKinship(g, "祖父", "儿子").description).toContain("儿子");
  });

  it("北方口语变体", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "祖父", { dialect: "northern" }).term).toBe("爷爷");
    expect(calculateKinship(g, "本人", "祖母", { dialect: "northern" }).term).toBe("奶奶");
  });

  it("外祖父母（母系）", () => {
    const ps = [p("外公", "MALE", 1900), p("外婆", "FEMALE", 1902), p("母亲", "FEMALE", 1930), p("本人", "FEMALE", 1960)];
    const rs = [rel("外公", "母亲"), rel("外婆", "母亲"), rel("母亲", "本人")];
    const g = graph(ps, rs);
    expect(calculateKinship(g, "本人", "外公").term).toContain("外祖父");
    expect(calculateKinship(g, "本人", "外婆").term).toContain("外祖母");
    expect(calculateKinship(g, "本人", "外公", { dialect: "northern" }).term).toBe("姥爷");
  });
});

describe("亲属称谓：旁系", () => {
  const people = [
    p("祖父", "MALE", 1900), p("祖母", "FEMALE", 1902),
    p("父亲", "MALE", 1930), p("伯父", "MALE", 1925), p("叔父", "MALE", 1935),
    p("母亲", "FEMALE", 1932), p("本人", "MALE", 1960), p("弟弟", "MALE", 1965),
    p("姐姐", "FEMALE", 1958), p("堂兄", "MALE", 1955), p("侄子", "MALE", 1990),
  ];
  const relations = [
    rel("祖父", "父亲"), rel("祖父", "伯父"), rel("祖父", "叔父"),
    rel("祖母", "父亲"), rel("祖母", "伯父"), rel("祖母", "叔父"),
    rel("父亲", "本人"), rel("母亲", "本人"),
    rel("父亲", "弟弟"), rel("母亲", "弟弟"),
    rel("父亲", "姐姐"), rel("母亲", "姐姐"),
    rel("伯父", "堂兄"), rel("弟弟", "侄子"),
  ];

  it("兄弟姐妹按性别与长幼区分，信息不足时用中性称谓", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "弟弟").term).toBe("弟弟");
    expect(calculateKinship(g, "弟弟", "本人").term).toBe("哥哥");
    expect(calculateKinship(g, "本人", "姐姐").term).toBe("姐姐");
    const noAge = graph([p("A", "MALE"), p("B", "MALE"), p("P", "MALE")], [rel("P", "A"), rel("P", "B")]);
    expect(calculateKinship(noAge, "A", "B").term).toBe("兄弟");
  });

  it("伯叔姑舅姨", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "伯父").term).toBe("伯父");
    expect(calculateKinship(g, "本人", "叔父").term).toBe("叔父");
  });

  it("堂兄弟 / 侄子", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "本人", "堂兄").term).toBe("堂兄弟");
    expect(calculateKinship(g, "本人", "侄子").term).toBe("侄子");
  });
});

describe("亲属称谓：姻亲与收养", () => {
  const people = [
    p("夫", "MALE", 1980), p("妻", "FEMALE", 1982),
    p("公公", "MALE", 1950), p("岳父", "MALE", 1952),
    p("养父", "MALE", 1955), p("养子", "MALE", 1990),
    p("儿媳", "FEMALE", 2000), p("儿子", "MALE", 2002),
  ];
  const relations = [
    rel("夫", "妻", "SPOUSE", "MARRIAGE"),
    rel("公公", "夫"), rel("岳父", "妻"),
    rel("养父", "养子", "ADOPTION", "ADOPTIVE"),
    rel("夫", "儿子"), rel("儿子", "儿媳", "SPOUSE", "MARRIAGE"),
  ];

  it("配偶互称", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "夫", "妻").term).toBe("妻子");
    expect(calculateKinship(g, "妻", "夫").term).toBe("丈夫");
  });

  it("姻亲称谓随本人性别变化", () => {
    const g = graph(people, relations);
    expect(calculateKinship(g, "妻", "公公").term).toBe("公公");
    expect(calculateKinship(g, "夫", "岳父").term).toBe("岳父");
    expect(calculateKinship(g, "夫", "儿媳").term).toBe("儿媳");
  });

  it("收养关系不冒充血缘", () => {
    const g = graph(people, relations);
    const r = calculateKinship(g, "养子", "养父");
    expect(r.term).toBe("养父");
    expect(r.includesAffinalOrAdoptive).toBe(true);
    expect(r.note).toContain("非生物学血缘");
  });
});

describe("安全边界", () => {
  it("未核实关系不参与计算", () => {
    const ps = [p("A", "MALE", 1900), p("B", "MALE", 1930)];
    const g = graph(ps, [rel("A", "B", "PARENT_CHILD", "BIOLOGICAL", "UNVERIFIED")]);
    const r = calculateKinship(g, "B", "A");
    expect(r.determined).toBe(false);
    expect(r.term).toBe("无法确定");
    expect(r.note).toContain("已核实");
    expect(g.ignored).toHaveLength(1);
  });

  it("无关系链时明确无法确定，不编造", () => {
    const g = graph([p("A", "MALE"), p("B", "FEMALE")], []);
    const r = calculateKinship(g, "A", "B");
    expect(r.determined).toBe(false);
    expect(r.path).toHaveLength(0);
  });

  it("继亲 / 过继关系不生成血缘称谓", () => {
    const ps = [p("继父", "MALE"), p("本人", "MALE")];
    const g = graph(ps, [rel("继父", "本人", "PARENT_CHILD", "STEP")]);
    expect(calculateKinship(g, "本人", "继父").determined).toBe(false);
    expect(g.ignored[0].reason).toContain("非生物学血缘");
  });

  it("检测到血缘环", () => {
    const cycle = detectBloodCycle([
      rel("A", "B"), rel("B", "C"), rel("C", "A"),
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("A");
  });

  it("无环的正常关系不误报", () => {
    expect(detectBloodCycle([rel("A", "B"), rel("B", "C")])).toBeNull();
  });
});

describe("祖先与后代追溯", () => {
  const people = [p("曾祖", "MALE", 1870), p("祖", "MALE", 1900), p("父", "MALE", 1930), p("本人", "MALE", 1960), p("子", "MALE", 1990), p("孙", "MALE", 2020)];
  const relations = [rel("曾祖", "祖"), rel("祖", "父"), rel("父", "本人"), rel("本人", "子"), rel("子", "孙")];

  it("按世代分组追溯祖先", () => {
    const g = graph(people, relations);
    const a = getAncestors(g, "本人", 3);
    expect(a[0].ids).toContain("父");
    expect(a[1].ids).toContain("祖");
    expect(a[2].ids).toContain("曾祖");
  });

  it("按世代分组查询后代", () => {
    const g = graph(people, relations);
    const d = getDescendants(g, "本人", 2);
    expect(d[0].ids).toContain("子");
    expect(d[1].ids).toContain("孙");
  });

  it("收养关系不进入血缘祖先链", () => {
    const ps = [p("养父", "MALE"), p("本人", "MALE")];
    const g = graph(ps, [rel("养父", "本人", "ADOPTION", "ADOPTIVE")]);
    expect(getAncestors(g, "本人")).toHaveLength(0);
  });
});

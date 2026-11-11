/**
 * 亲属称谓计算引擎（纯函数，无数据库依赖）
 *
 * 设计纪律：
 * 1. 只使用「已核实」的关系（默认），未核实 / 存疑 / 驳回关系一律不参与推断。
 * 2. 生物学血缘（PARENT_CHILD + BIOLOGICAL）与婚姻关系（SPOUSE）、
 *    收养关系（ADOPTION）严格区分：收养只产生「养父/养母/养子/养女」，
 *    绝不会输出「父亲/爷爷」等血缘称谓。
 * 3. 性别、年龄（出生年 / 世代）、关系方向、地方称谓差异均参与判定；
 *    信息不足时使用中性称谓（兄弟 / 姐妹 / 堂兄弟），不臆造排行。
 * 4. 无路径或多条等价路径无法区分时明确返回「无法确定」。
 *
 * 算法：把关系图转为带标签的有向边，用 BFS 枚举最短关系链（默认最大 6 跳），
 * 再把边标签序列映射为汉语亲属称谓；无标准称谓时输出「父亲的哥哥的儿子」式描述链。
 */

export type Gender = "MALE" | "FEMALE" | "UNKNOWN";
export type RelationTypeLike =
  | "PARENT_CHILD" | "SPOUSE" | "SIBLING" | "ADOPTION"
  | "SUCCESSION" | "GUARDIANSHIP" | "CROSS_FAMILY_LINK";
export type RelationSubtypeLike =
  | "BIOLOGICAL" | "ADOPTIVE" | "STEP" | "FOSTER" | "FULL"
  | "HALF_PATERNAL" | "HALF_MATERNAL" | "MARRIAGE" | "CONCUBINAGE" | "UNKNOWN";
export type VerificationLike = "UNVERIFIED" | "PENDING" | "VERIFIED" | "DISPUTED" | "REJECTED";

export interface KinshipPerson {
  id: string;
  gender: Gender;
  birthYear?: number | null;
  generationNumber?: number | null;
  name?: string;
}

export interface KinshipRelation {
  fromPersonId: string;
  toPersonId: string;
  type: RelationTypeLike;
  subtype: RelationSubtypeLike;
  verification: VerificationLike;
  /** 多次婚姻的序号，用于区分现任/前任配偶 */
  marriageOrder?: number | null;
}

export type EdgeCode =
  | "F" | "M" | "P"       // 父亲 / 母亲 / 父母(性别未知)
  | "S" | "D" | "C"       // 儿子 / 女儿 / 子女(性别未知)
  | "H" | "W" | "SP"      // 丈夫 / 妻子 / 配偶(性别未知)
  | "OB" | "LB" | "B"     // 兄 / 弟 / 兄弟(排行未知)
  | "OS" | "LS" | "Z"     // 姐 / 妹 / 姐妹(排行未知)
  | "AF" | "AM" | "AP"    // 养父 / 养母 / 养父母(性别未知)
  | "AS" | "AD" | "AC";   // 养子 / 养女 / 养子女(性别未知)

export interface KinshipEdge {
  to: string;
  code: EdgeCode;
  /** 是否血缘边（婚姻/收养为 false） */
  blood: boolean;
  label: string;
}

export interface KinshipGraph {
  people: Map<string, KinshipPerson>;
  edges: Map<string, KinshipEdge[]>;
  /** 记录被忽略的关系及原因，便于审计与前端提示 */
  ignored: Array<{ fromPersonId: string; toPersonId: string; type: string; reason: string }>;
}

export interface KinshipResult {
  determined: boolean;
  /** 主称谓；无法确定时为「无法确定」 */
  term: string;
  /** 地方称谓变体 */
  variants: string[];
  /** 通俗解释，如「父亲的哥哥」 */
  description: string;
  /** 关系链标签 */
  path: string[];
  /** 边编码链（调试/规则匹配用） */
  codes: EdgeCode[];
  /** 是否包含婚姻或收养关系 */
  includesAffinalOrAdoptive: boolean;
  /** 存在多条等价路径时的其他可能称谓 */
  alternatives: string[];
  note?: string;
}

export interface KinshipOptions {
  /** 默认 true：仅使用已核实关系 */
  requireVerified?: boolean;
  /** 最大关系链跳数，默认 6 */
  maxDepth?: number;
  /** 地方称谓：标准普通话 / 北方口语 */
  dialect?: "standard" | "northern";
}

const DEFAULT_OPTIONS: Required<KinshipOptions> = {
  requireVerified: true,
  maxDepth: 6,
  dialect: "standard",
};

function isUsable(r: KinshipRelation, requireVerified: boolean): boolean {
  if (!requireVerified) return r.verification !== "REJECTED";
  return r.verification === "VERIFIED";
}

function parentCode(gender: Gender): EdgeCode {
  return gender === "MALE" ? "F" : gender === "FEMALE" ? "M" : "P";
}
function childCode(gender: Gender): EdgeCode {
  return gender === "MALE" ? "S" : gender === "FEMALE" ? "D" : "C";
}
function spouseCode(gender: Gender): EdgeCode {
  return gender === "MALE" ? "H" : gender === "FEMALE" ? "W" : "SP";
}
function siblingCode(gender: Gender, elder: boolean | null): EdgeCode {
  if (gender === "MALE") return elder === null ? "B" : elder ? "OB" : "LB";
  if (gender === "FEMALE") return elder === null ? "Z" : elder ? "OS" : "LS";
  return "B";
}

/** 依据出生年或世代判断目标是否年长；信息不足返回 null（不臆造排行）。 */
function isElder(a: KinshipPerson, b: KinshipPerson): boolean | null {
  if (a.birthYear != null && b.birthYear != null && a.birthYear !== b.birthYear) {
    return b.birthYear < a.birthYear;
  }
  if (a.generationNumber != null && b.generationNumber != null && a.generationNumber !== b.generationNumber) {
    return b.generationNumber < a.generationNumber;
  }
  return null;
}

const LABELS: Record<EdgeCode, string> = {
  F: "父亲", M: "母亲", P: "父母",
  S: "儿子", D: "女儿", C: "子女",
  H: "丈夫", W: "妻子", SP: "配偶",
  OB: "哥哥", LB: "弟弟", B: "兄弟",
  OS: "姐姐", LS: "妹妹", Z: "姐妹",
  AF: "养父", AM: "养母", AP: "养父母",
  AS: "养子", AD: "养女", AC: "养子女",
};

/** 构建关系图。会自动从共同父母推导亲兄弟姐妹，并区分全血缘 / 半血缘。 */
export function buildKinshipGraph(
  people: KinshipPerson[],
  relations: KinshipRelation[],
  options: KinshipOptions = {},
): KinshipGraph {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const personMap = new Map(people.map((p) => [p.id, p]));
  const edges = new Map<string, KinshipEdge[]>();
  const ignored: KinshipGraph["ignored"] = [];

  const put = (from: string, edge: KinshipEdge) => {
    if (!personMap.has(from) || !personMap.has(edge.to)) return;
    const list = edges.get(from) ?? [];
    // 去重（同一对人物、同一编码）
    if (!list.some((e) => e.to === edge.to && e.code === edge.code)) list.push(edge);
    edges.set(from, list);
  };
  const mk = (to: string, code: EdgeCode, blood = true): KinshipEdge => ({ to, code, blood, label: LABELS[code] });

  const biologicalParents = new Map<string, Set<string>>();

  for (const r of relations) {
    if (!isUsable(r, opt.requireVerified)) {
      ignored.push({ fromPersonId: r.fromPersonId, toPersonId: r.toPersonId, type: r.type, reason: "关系未核实，不参与称谓计算" });
      continue;
    }
    const from = personMap.get(r.fromPersonId);
    const to = personMap.get(r.toPersonId);
    if (!from || !to) {
      ignored.push({ fromPersonId: r.fromPersonId, toPersonId: r.toPersonId, type: r.type, reason: "关联人物不存在" });
      continue;
    }

    if (r.type === "PARENT_CHILD" && r.subtype === "BIOLOGICAL") {
      put(r.fromPersonId, mk(r.toPersonId, childCode(to.gender)));
      put(r.toPersonId, mk(r.fromPersonId, parentCode(from.gender)));
      const set = biologicalParents.get(r.toPersonId) ?? new Set<string>();
      set.add(r.fromPersonId);
      biologicalParents.set(r.toPersonId, set);
    } else if (r.type === "PARENT_CHILD" && (r.subtype === "STEP" || r.subtype === "FOSTER")) {
      // 继亲 / 抚养：只记录为非血缘关联，不生成父子/母子称谓
      ignored.push({ fromPersonId: r.fromPersonId, toPersonId: r.toPersonId, type: r.type, reason: "继亲/抚养关系非生物学血缘，不生成血缘称谓" });
    } else if (r.type === "ADOPTION") {
      put(r.fromPersonId, mk(r.toPersonId, to.gender === "MALE" ? "AS" : to.gender === "FEMALE" ? "AD" : "AC", false));
      put(r.toPersonId, mk(r.fromPersonId, from.gender === "MALE" ? "AF" : from.gender === "FEMALE" ? "AM" : "AP", false));
    } else if (r.type === "SPOUSE") {
      put(r.fromPersonId, mk(r.toPersonId, spouseCode(to.gender), false));
      put(r.toPersonId, mk(r.fromPersonId, spouseCode(from.gender), false));
    } else if (r.type === "SIBLING") {
      const elderFromTo = isElder(from, to);
      const elderToFrom = elderFromTo === null ? null : !elderFromTo;
      put(r.fromPersonId, mk(r.toPersonId, siblingCode(to.gender, elderFromTo), r.subtype !== "STEP"));
      put(r.toPersonId, mk(r.fromPersonId, siblingCode(from.gender, elderToFrom), r.subtype !== "STEP"));
    } else if (r.type === "SUCCESSION") {
      // 过继 / 承祧：涉及宗法继承，不自动等同于生物学父子
      ignored.push({ fromPersonId: r.fromPersonId, toPersonId: r.toPersonId, type: r.type, reason: "过继/承祧需人工确认，不自动推断血缘" });
    } else if (r.type === "CROSS_FAMILY_LINK" || r.type === "GUARDIANSHIP") {
      ignored.push({ fromPersonId: r.fromPersonId, toPersonId: r.toPersonId, type: r.type, reason: "跨家族关联/监护关系不参与称谓计算" });
    }
  }

  // 共同生物学父母 → 推导兄弟姐妹（若已显式声明则不重复添加）
  const childrenOfParent = new Map<string, string[]>();
  for (const [childId, parents] of biologicalParents) {
    for (const p of parents) {
      const arr = childrenOfParent.get(p) ?? [];
      arr.push(childId);
      childrenOfParent.set(p, arr);
    }
  }
  for (const siblings of childrenOfParent.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = personMap.get(siblings[i])!;
        const b = personMap.get(siblings[j])!;
        const elder = isElder(a, b);
        put(a.id, mk(b.id, siblingCode(b.gender, elder), true));
        put(b.id, mk(a.id, siblingCode(a.gender, elder === null ? null : !elder), true));
      }
    }
  }

  return { people: personMap, edges, ignored };
}

/** 称谓规则表。键为边编码链，* 为单步通配。值可以是字符串或依据目标性别的函数。 */
type TermRule = string | ((target: KinshipPerson, dialect: "standard" | "northern") => string);

const RULES: Array<[string, TermRule]> = [
  // 直系长辈
  ["F", "父亲"], ["M", "母亲"], ["P", "父母"],
  ["F-F", (_, d) => (d === "northern" ? "爷爷" : "祖父（爷爷）")],
  ["F-M", (_, d) => (d === "northern" ? "奶奶" : "祖母（奶奶）")],
  ["M-F", (_, d) => (d === "northern" ? "姥爷" : "外祖父（外公）")],
  ["M-M", (_, d) => (d === "northern" ? "姥姥" : "外祖母（外婆）")],
  ["F-F-F", "曾祖父"], ["F-F-M", "曾祖母"], ["M-F-F", "外曾祖父"], ["M-F-M", "外曾祖母"],
  ["F-F-F-F", "高祖父"], ["F-F-F-M", "高祖母"],
  // 直系晚辈
  ["S", "儿子"], ["D", "女儿"], ["C", "子女"],
  ["S-S", "孙子"], ["S-D", "孙女"], ["D-S", "外孙"], ["D-D", "外孙女"],
  ["S-S-S", "曾孙"], ["S-S-D", "曾孙女"],
  // 配偶
  ["H", "丈夫"], ["W", "妻子"], ["SP", "配偶"],
  // 兄弟姐妹
  ["OB", "哥哥"], ["LB", "弟弟"], ["B", "兄弟"],
  ["OS", "姐姐"], ["LS", "妹妹"], ["Z", "姐妹"],
  // 父母的兄弟姐妹（伯叔姑舅姨）
  ["F-OB", "伯父"], ["F-LB", "叔父"], ["F-B", "伯叔"],
  ["F-OS", "姑母"], ["F-LS", "姑母"], ["F-Z", "姑母"],
  ["M-OB", "舅父"], ["M-LB", "舅父"], ["M-B", "舅父"],
  ["M-OS", "姨母"], ["M-LS", "姨母"], ["M-Z", "姨母"],
  // 兄弟姐妹的配偶
  ["OB-W", "嫂子"], ["LB-W", "弟媳"],
  ["OS-H", "姐夫"], ["LS-H", "妹夫"],
  // 侄甥
  ["OB-S", "侄子"], ["LB-S", "侄子"], ["B-S", "侄子"],
  ["OB-D", "侄女"], ["LB-D", "侄女"], ["B-D", "侄女"],
  ["OS-S", "外甥"], ["LS-S", "外甥"], ["Z-S", "外甥"],
  ["OS-D", "外甥女"], ["LS-D", "外甥女"], ["Z-D", "外甥女"],
  // 堂表兄弟姐妹：父系兄弟之子为堂，其余为表
  ["F-OB-S", "堂兄弟"], ["F-LB-S", "堂兄弟"], ["F-B-S", "堂兄弟"],
  ["F-OB-D", "堂姐妹"], ["F-LB-D", "堂姐妹"], ["F-B-D", "堂姐妹"],
  ["F-OS-S", "表兄弟"], ["F-LS-S", "表兄弟"], ["F-Z-S", "表兄弟"],
  ["M-OB-S", "表兄弟"], ["M-B-S", "表兄弟"],
  ["M-OS-S", "表兄弟"], ["M-Z-S", "表兄弟"],
  ["F-OS-D", "表姐妹"], ["F-Z-D", "表姐妹"],
  ["M-*-D", "表姐妹"], ["M-*-S", "表兄弟"],
  // 配偶的父母（姻亲，需依据本人性别）
  ["H-F", "公公"], ["H-M", "婆婆"],
  ["W-F", "岳父"], ["W-M", "岳母"],
  ["SP-F", "配偶的父亲"], ["SP-M", "配偶的母亲"],
  // 子女的配偶
  ["S-W", "儿媳"], ["D-H", "女婿"],
  // 祖孙
  ["F-F-S", (t) => (t.gender === "FEMALE" ? "孙女（本人视角需另行判定）" : "孙子（本人视角需另行判定）")],
  // 收养
  ["AF", "养父"], ["AM", "养母"], ["AP", "养父母"],
  ["AS", "养子"], ["AD", "养女"], ["AC", "养子女"],
];

function matchRule(codes: EdgeCode[]): TermRule | null {
  const key = codes.join("-");
  for (const [pattern, rule] of RULES) {
    if (pattern === key) return rule;
    if (pattern.includes("*")) {
      const p = pattern.split("-");
      if (p.length !== codes.length) continue;
      if (p.every((seg, i) => seg === "*" || seg === codes[i])) return rule;
    }
  }
  return null;
}

function resolveTerm(rule: TermRule, target: KinshipPerson, dialect: "standard" | "northern"): string {
  return typeof rule === "function" ? rule(target, dialect) : rule;
}

function dialectVariants(term: string, dialect: "standard" | "northern"): string[] {
  const map: Record<string, string[]> = {
    "祖父（爷爷）": ["爷爷", "祖父"],
    "祖母（奶奶）": ["奶奶", "祖母"],
    "外祖父（外公）": ["外公", "姥爷", "外祖父"],
    "外祖母（外婆）": ["外婆", "姥姥", "外祖母"],
    "伯父": ["伯伯", "大伯"],
    "叔父": ["叔叔", "叔父"],
    "姑母": ["姑姑", "姑妈"],
    "舅父": ["舅舅", "舅父"],
    "姨母": ["姨妈", "阿姨"],
    "丈夫": ["丈夫", "先生", "老公"],
    "妻子": ["妻子", "太太", "老婆"],
  };
  const base = map[term] ?? [term];
  return dialect === "northern" ? base : base.slice(0, 3);
}

interface PathResult {
  codes: EdgeCode[];
  labels: string[];
  includesAffinalOrAdoptive: boolean;
}

/** BFS 枚举最短关系链（最多保留 4 条等价路径，用于歧义提示）。 */
function findPaths(graph: KinshipGraph, from: string, to: string, maxDepth: number): PathResult[] {
  if (from === to) return [];
  const results: PathResult[] = [];
  const queue: Array<{ id: string; codes: EdgeCode[]; labels: string[]; affinal: boolean; visited: Set<string> }> = [
    { id: from, codes: [], labels: [], affinal: false, visited: new Set([from]) },
  ];
  let foundDepth = Infinity;

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.codes.length >= foundDepth || cur.codes.length >= maxDepth) continue;
    for (const e of graph.edges.get(cur.id) ?? []) {
      if (cur.visited.has(e.to)) continue;
      const codes = [...cur.codes, e.code];
      const labels = [...cur.labels, e.label];
      const affinal = cur.affinal || !e.blood;
      if (e.to === to) {
        if (codes.length < foundDepth) { foundDepth = codes.length; results.length = 0; }
        if (codes.length === foundDepth && results.length < 4) {
          results.push({ codes, labels, includesAffinalOrAdoptive: affinal });
        }
        continue;
      }
      const visited = new Set(cur.visited);
      visited.add(e.to);
      queue.push({ id: e.to, codes, labels, affinal, visited });
    }
  }
  return results;
}

/** 把边编码链转成可读的中文描述（例如「父亲的哥哥」）。 */
function describe(labels: string[]): string {
  if (labels.length === 0) return "";
  return labels.reduce((acc, label, i) => (i === 0 ? label : `${acc}的${label}`), "");
}

export function calculateKinship(
  graph: KinshipGraph,
  fromId: string,
  toId: string,
  options: KinshipOptions = {},
): KinshipResult {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const empty = (note?: string): KinshipResult => ({
    determined: false, term: "无法确定", variants: [], description: "", path: [], codes: [],
    includesAffinalOrAdoptive: false, alternatives: [], note,
  });
  const from = graph.people.get(fromId);
  const to = graph.people.get(toId);
  if (!from || !to) return empty("人物不存在或不在当前可访问的族谱范围内");
  if (fromId === toId) return empty("不能计算本人与本人的亲属称谓");

  const paths = findPaths(graph, fromId, toId, opt.maxDepth);
  if (paths.length === 0) {
    return empty("数据库中没有足够且已核实的关系链，系统不会推断或编造亲属关系");
  }

  const primary = paths[0];
  const rule = matchRule(primary.codes);
  const term = rule
    ? resolveTerm(rule, to, opt.dialect)
    : describe(primary.labels) || "关系较远";
  const alternatives = Array.from(new Set(
    paths.slice(1)
      .map((p) => {
        const r = matchRule(p.codes);
        return r ? resolveTerm(r, to, opt.dialect) : describe(p.labels);
      })
      .filter((t) => t && t !== term),
  ));

  return {
    determined: true,
    term,
    variants: dialectVariants(term, opt.dialect),
    description: describe(primary.labels),
    path: primary.labels,
    codes: primary.codes,
    includesAffinalOrAdoptive: primary.includesAffinalOrAdoptive,
    alternatives,
    note: !rule
      ? "关系链较远，系统给出的是关系链描述而非固定称谓；请结合家族实际称谓习惯使用"
      : alternatives.length > 0
        ? "存在多条等价关系链（可能涉及姻亲或近亲婚姻），已列出其他可能称谓"
        : primary.includesAffinalOrAdoptive
          ? "该称谓涉及婚姻或收养关系，非生物学血缘"
          : undefined,
  };
}

/** 追溯祖先：沿生物学父母边向上，返回按世代分组的 ID。 */
export function getAncestors(graph: KinshipGraph, personId: string, generations = 5): Array<{ generation: number; ids: string[] }> {
  const out: Array<{ generation: number; ids: string[] }> = [];
  let current = [personId];
  const seen = new Set([personId]);
  for (let g = 1; g <= generations; g++) {
    const next: string[] = [];
    for (const id of current) {
      for (const e of graph.edges.get(id) ?? []) {
        if (!e.blood) continue;
        if (!["F", "M", "P"].includes(e.code)) continue;
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    if (!next.length) break;
    out.push({ generation: g, ids: next });
    current = next;
  }
  return out;
}

/** 查询后代：沿生物学子女边向下。 */
export function getDescendants(graph: KinshipGraph, personId: string, generations = 5): Array<{ generation: number; ids: string[] }> {
  const out: Array<{ generation: number; ids: string[] }> = [];
  let current = [personId];
  const seen = new Set([personId]);
  for (let g = 1; g <= generations; g++) {
    const next: string[] = [];
    for (const id of current) {
      for (const e of graph.edges.get(id) ?? []) {
        if (!e.blood) continue;
        if (!["S", "D", "C"].includes(e.code)) continue;
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        next.push(e.to);
      }
    }
    if (!next.length) break;
    out.push({ generation: g, ids: next });
    current = next;
  }
  return out;
}

/** 检测生物学父子关系是否形成环（A 不能是自己的祖先）。 */
export function detectBloodCycle(relations: KinshipRelation[]): string[] | null {
  const parents = new Map<string, string[]>();
  for (const r of relations) {
    if (r.type !== "PARENT_CHILD" || r.subtype !== "BIOLOGICAL") continue;
    if (r.verification === "REJECTED") continue;
    const arr = parents.get(r.toPersonId) ?? [];
    arr.push(r.fromPersonId);
    parents.set(r.toPersonId, arr);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const p of parents.get(id) ?? []) {
      const cycle = dfs(p);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of parents.keys()) {
    const cycle = dfs(id);
    if (cycle) return cycle;
  }
  return null;
}

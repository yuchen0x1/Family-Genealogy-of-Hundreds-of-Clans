/**
 * 族谱图谱布局引擎（纯函数，可单测）
 *
 * 目标：在有限画布中为多代家族生成清晰、无重叠的树状布局。
 * - 世代按生物学亲子关系推导，显式 generationNumber 优先；
 * - 配偶尽量并排，子女居中于父母之间；
 * - 支持纵向（传统家族树）与横向（世系图）两种坐标映射；
 * - 只做布局，不推断任何未录入的关系。
 */

export interface LayoutNode {
  id: string;
  name: string;
  gender?: string;
  birthYear?: number | null;
  generationNumber?: number | null;
  branchId?: string | null;
  isFocus?: boolean;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  subtype?: string;
  label?: string;
}

export interface PositionedNode extends LayoutNode {
  x: number;
  y: number;
  generation: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends LayoutEdge {
  path: string;
  color: string;
  dashed: boolean;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
  generations: number;
}

export const NODE_WIDTH = 148;
export const NODE_HEIGHT = 64;
export const H_GAP = 34;
export const V_GAP = 130;
const MIN_UNIT = NODE_WIDTH + H_GAP;

export type Orientation = "vertical" | "horizontal";

/** 由亲子关系推导世代；显式 generationNumber 优先。 */
export function computeGenerations(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "PARENT_CHILD" || e.subtype === "STEP") continue;
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const arr = parents.get(e.target) ?? [];
    arr.push(e.source);
    parents.set(e.target, arr);
  }
  const explicit = new Map(nodes.filter((n) => n.generationNumber != null).map((n) => [n.id, n.generationNumber! - 1]));
  const gen = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    if (gen.has(id)) return gen.get(id)!;
    if (visiting.has(id)) return 0; // 防御异常数据造成的环
    visiting.add(id);
    const ps = parents.get(id) ?? [];
    const value = ps.length ? Math.max(...ps.map(resolve)) + 1 : 0;
    visiting.delete(id);
    gen.set(id, value);
    return value;
  };
  for (const n of nodes) resolve(n.id);
  for (const [id, g] of explicit) gen.set(id, Math.max(0, g));
  return gen;
}

/** 同一世代内按「父母位置 → 出生年 → 稳定 id」排序，保证多次渲染布局稳定。 */
function orderGeneration(nodes: LayoutNode[], edges: LayoutEdge[], gen: Map<string, number>): Map<number, string[]> {
  const byGen = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const g = gen.get(n.id) ?? 0;
    const arr = byGen.get(g) ?? [];
    arr.push(n);
    byGen.set(g, arr);
  }
  const parentOf = new Map<string, string>();
  for (const e of edges) if (e.type === "PARENT_CHILD" && !parentOf.has(e.target)) parentOf.set(e.target, e.source);

  const index = new Map<string, number>();
  for (const [g, arr] of byGen) {
    arr.sort((a, b) => {
      const pa = parentOf.get(a.id); const pb = parentOf.get(b.id);
      if (pa && pb && pa !== pb) return (index.get(pa) ?? 0) - (index.get(pb) ?? 0);
      const ya = a.birthYear ?? 9999; const yb = b.birthYear ?? 9999;
      if (ya !== yb) return ya - yb;
      return a.id.localeCompare(b.id);
    });
    arr.forEach((n, i) => index.set(n.id, g * 10000 + i));
  }
  const result = new Map<number, string[]>();
  for (const [g, arr] of byGen) result.set(g, arr.map((n) => n.id));
  return result;
}

/** 迭代式去重叠：把同一世代的节点按目标位置排序，再施加最小间距。 */
function spread(ids: string[], desired: Map<string, number>): Map<string, number> {
  const sorted = [...ids].sort((a, b) => (desired.get(a) ?? 0) - (desired.get(b) ?? 0));
  const pos = new Map<string, number>();
  let cursor = -Infinity;
  for (const id of sorted) {
    const x = Math.max(desired.get(id) ?? 0, cursor + MIN_UNIT);
    pos.set(id, x);
    cursor = x;
  }
  return pos;
}

function colorForEdge(e: LayoutEdge): { color: string; dashed: boolean } {
  switch (e.type) {
    case "SPOUSE": return { color: "#b08d57", dashed: false };
    case "ADOPTION": return { color: "#3e6b6b", dashed: true };
    case "SIBLING": return { color: "#9aa3ab", dashed: true };
    case "SUCCESSION": return { color: "#7a5b9a", dashed: true };
    case "CROSS_FAMILY_LINK": return { color: "#a63d2f", dashed: true };
    default: return { color: e.subtype === "BIOLOGICAL" ? "#5a6069" : "#8a8f95", dashed: e.subtype !== "BIOLOGICAL" };
  }
}

/**
 * 生成布局。orientation=vertical 时 y 为世代方向（祖先在上），
 * horizontal 时 x 为世代方向（祖先在左）。
 */
export function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: { orientation?: Orientation; collapsed?: Set<string> } = {},
): LayoutResult {
  const orientation = options.orientation ?? "vertical";
  const collapsed = options.collapsed ?? new Set<string>();
  if (nodes.length === 0) return { nodes: [], edges: [], width: 0, height: 0, generations: 0 };

  const ids = new Set(nodes.map((n) => n.id));
  const gen = computeGenerations(nodes, edges);
  const byGen = orderGeneration(nodes, edges, gen);

  // 配偶吸附：把配偶放到伴侣附近；子女位置取父母平均
  const desired = new Map<string, number>();
  const maxGen = Math.max(...Array.from(byGen.keys()));
  for (const [, arr] of byGen) arr.forEach((id, i) => desired.set(id, i * MIN_UNIT));

  const parentIds = new Map<string, string[]>();
  const spouseOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if (e.type === "PARENT_CHILD") {
      const arr = parentIds.get(e.target) ?? [];
      arr.push(e.source);
      parentIds.set(e.target, arr);
    } else if (e.type === "SPOUSE") {
      const a = spouseOf.get(e.source) ?? []; a.push(e.target); spouseOf.set(e.source, a);
      const b = spouseOf.get(e.target) ?? []; b.push(e.source); spouseOf.set(e.target, b);
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    // 自上而下：子女靠近父母平均位置
    for (let g = 1; g <= maxGen; g++) {
      for (const id of byGen.get(g) ?? []) {
        const ps = (parentIds.get(id) ?? []).filter((p) => desired.has(p));
        if (ps.length) desired.set(id, ps.reduce((s, p) => s + (desired.get(p) ?? 0), 0) / ps.length);
      }
      const spreaded = spread(byGen.get(g) ?? [], desired);
      for (const [id, x] of spreaded) desired.set(id, x);
    }
    // 自下而上：父母靠近子女平均位置（配偶自然并排）
    for (let g = maxGen - 1; g >= 0; g--) {
      for (const id of byGen.get(g) ?? []) {
        const children = Array.from(parentIds.entries()).filter(([, ps]) => ps.includes(id)).map(([c]) => c);
        const spouses = spouseOf.get(id) ?? [];
        const anchors = [...children, ...spouses].filter((a) => desired.has(a));
        if (anchors.length) {
          const avg = anchors.reduce((s, a) => s + (desired.get(a) ?? 0), 0) / anchors.length;
          desired.set(id, (desired.get(id) ?? 0) * 0.35 + avg * 0.65);
        }
      }
      const spreaded = spread(byGen.get(g) ?? [], desired);
      for (const [id, x] of spreaded) desired.set(id, x);
    }
  }

  // 折叠：隐藏指定节点的所有后代（用于大型族谱按需展开）
  const hidden = new Set<string>();
  if (collapsed.size) {
    const children = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type !== "PARENT_CHILD") continue;
      const arr = children.get(e.source) ?? []; arr.push(e.target); children.set(e.source, arr);
    }
    const queue = Array.from(collapsed);
    while (queue.length) {
      const id = queue.shift()!;
      for (const c of children.get(id) ?? []) {
        if (hidden.has(c)) continue;
        hidden.add(c);
        queue.push(c);
      }
    }
  }

  const positioned: PositionedNode[] = nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) => {
      const g = gen.get(n.id) ?? 0;
      const along = desired.get(n.id) ?? 0;
      const across = g * (NODE_HEIGHT + V_GAP);
      return {
        ...n,
        generation: g,
        x: orientation === "vertical" ? along : across,
        y: orientation === "vertical" ? across : along,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    });

  const posMap = new Map(positioned.map((n) => [n.id, n]));
  const positionedEdges: PositionedEdge[] = edges
    .filter((e) => posMap.has(e.source) && posMap.has(e.target))
    .map((e) => {
      const a = posMap.get(e.source)!;
      const b = posMap.get(e.target)!;
      let path: string;
      if (e.type === "SPOUSE") {
        if (orientation === "vertical") {
          const y = Math.min(a.y, b.y) + NODE_HEIGHT / 2;
          path = `M ${a.x + NODE_WIDTH / 2} ${y} L ${b.x + NODE_WIDTH / 2} ${y}`;
        } else {
          const x = Math.min(a.x, b.x) + NODE_WIDTH / 2;
          path = `M ${x} ${a.y + NODE_HEIGHT / 2} L ${x} ${b.y + NODE_HEIGHT / 2}`;
        }
      } else if (orientation === "vertical") {
        const sx = a.x + NODE_WIDTH / 2;
        const sy = a.y + NODE_HEIGHT;
        const tx = b.x + NODE_WIDTH / 2;
        const ty = b.y;
        const mid = sy + (ty - sy) / 2;
        path = `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`;
      } else {
        const sx = a.x + NODE_WIDTH;
        const sy = a.y + NODE_HEIGHT / 2;
        const tx = b.x;
        const ty = b.y + NODE_HEIGHT / 2;
        const mid = sx + (tx - sx) / 2;
        path = `M ${sx} ${sy} L ${mid} ${sy} L ${mid} ${ty} L ${tx} ${ty}`;
      }
      return { ...e, path, ...colorForEdge(e) };
    });

  const width = Math.max(...positioned.map((n) => n.x + n.width), 400) + 80;
  const height = Math.max(...positioned.map((n) => n.y + n.height), 300) + 80;
  return { nodes: positioned, edges: positionedEdges, width, height, generations: maxGen + 1 };
}

/** 时间轴视图：按出生年横向排布，按世代纵向分层。 */
export function layoutTimeline(nodes: LayoutNode[], edges: LayoutEdge[]) {
  const gen = computeGenerations(nodes, edges);
  const years = nodes.map((n) => n.birthYear).filter((y): y is number => y != null);
  const minYear = years.length ? Math.min(...years) : 1800;
  const maxYear = years.length ? Math.max(...years) : 2020;
  const span = Math.max(1, maxYear - minYear);
  const width = 1400;
  const placed = nodes.map((n, i) => {
    const year = n.birthYear ?? minYear + (i / Math.max(1, nodes.length)) * span;
    return {
      ...n,
      generation: gen.get(n.id) ?? 0,
      x: 80 + ((year - minYear) / span) * (width - 200),
      y: 70 + (gen.get(n.id) ?? 0) * 110,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
  return {
    nodes: placed,
    ticks: Array.from({ length: 6 }, (_, i) => ({ year: Math.round(minYear + (span * i) / 5), x: 80 + ((width - 200) * i) / 5 })),
    width,
    height: 70 + (Math.max(...placed.map((n) => n.generation)) + 1) * 110 + 60,
  };
}

import { describe, it, expect } from "vitest";
import { computeGenerations, layoutGraph, layoutTimeline, NODE_WIDTH, NODE_HEIGHT, H_GAP } from "@/lib/graph-layout";
import type { LayoutNode, LayoutEdge } from "@/lib/graph-layout";

const n = (id: string, gender = "MALE", birthYear?: number): LayoutNode => ({ id, name: id, gender, birthYear });
const parent = (from: string, to: string): LayoutEdge => ({ id: `${from}-${to}`, source: from, target: to, type: "PARENT_CHILD", subtype: "BIOLOGICAL" });
const spouse = (a: string, b: string): LayoutEdge => ({ id: `s-${a}-${b}`, source: a, target: b, type: "SPOUSE" });

describe("世代推导", () => {
  it("三代直系", () => {
    const nodes = [n("祖"), n("父"), n("子")];
    const edges = [parent("祖", "父"), parent("父", "子")];
    const g = computeGenerations(nodes, edges);
    expect(g.get("祖")).toBe(0);
    expect(g.get("父")).toBe(1);
    expect(g.get("子")).toBe(2);
  });

  it("双亲共享同一世代，子女在下一世代", () => {
    const nodes = [n("父"), n("母", "FEMALE"), n("子")];
    const edges = [parent("父", "子"), parent("母", "子")];
    const g = computeGenerations(nodes, edges);
    expect(g.get("父")).toBe(0);
    expect(g.get("母")).toBe(0);
    expect(g.get("子")).toBe(1);
  });

  it("显式世代编号优先", () => {
    const nodes = [{ ...n("A"), generationNumber: 5 }, n("B")];
    const g = computeGenerations(nodes, [parent("A", "B")]);
    expect(g.get("A")).toBe(4);
  });

  it("异常环数据不会死循环", () => {
    const nodes = [n("A"), n("B")];
    const g = computeGenerations(nodes, [parent("A", "B"), parent("B", "A")]);
    expect(g.size).toBe(2);
  });
});

describe("树布局", () => {
  const nodes = [n("祖父", "MALE", 1900), n("祖母", "FEMALE", 1902), n("父", "MALE", 1930), n("母", "FEMALE", 1932), n("本人", "MALE", 1960), n("弟弟", "MALE", 1965)];
  const edges = [spouse("祖父", "祖母"), parent("祖父", "父"), parent("祖母", "父"), spouse("父", "母"), parent("父", "本人"), parent("母", "本人"), parent("父", "弟弟"), parent("母", "弟弟")];

  it("纵向布局：祖先在上，后代在下", () => {
    const r = layoutGraph(nodes, edges, { orientation: "vertical" });
    const byId = new Map(r.nodes.map((x) => [x.id, x]));
    expect(byId.get("祖父")!.y).toBeLessThan(byId.get("父")!.y);
    expect(byId.get("父")!.y).toBeLessThan(byId.get("本人")!.y);
    expect(r.generations).toBe(3);
  });

  it("横向布局：世代方向翻转", () => {
    const r = layoutGraph(nodes, edges, { orientation: "horizontal" });
    const byId = new Map(r.nodes.map((x) => [x.id, x]));
    expect(byId.get("祖父")!.x).toBeLessThan(byId.get("父")!.x);
    expect(byId.get("父")!.x).toBeLessThan(byId.get("本人")!.x);
  });

  it("同一世代节点不重叠", () => {
    const r = layoutGraph(nodes, edges);
    const byGen = new Map<number, typeof r.nodes>();
    for (const p of r.nodes) byGen.set(p.generation, [...(byGen.get(p.generation) ?? []), p]);
    for (const [, arr] of byGen) {
      const sorted = [...arr].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].x - sorted[i - 1].x).toBeGreaterThanOrEqual(NODE_WIDTH + H_GAP - 1);
      }
    }
  });

  it("关系类型映射为不同连线样式", () => {
    const r = layoutGraph(nodes, [...edges, { id: "adopt", source: "父", target: "弟弟", type: "ADOPTION" }]);
    const adopt = r.edges.find((e) => e.type === "ADOPTION");
    expect(adopt?.dashed).toBe(true);
    const bio = r.edges.find((e) => e.type === "PARENT_CHILD");
    expect(bio?.dashed).toBe(false);
  });

  it("折叠分支隐藏后代", () => {
    const r = layoutGraph(nodes, edges, { collapsed: new Set(["父"]) });
    const ids = new Set(r.nodes.map((x) => x.id));
    expect(ids.has("父")).toBe(true);
    expect(ids.has("本人")).toBe(false);
    expect(ids.has("弟弟")).toBe(false);
    expect(ids.has("祖父")).toBe(true);
  });

  it("空图安全返回", () => {
    const r = layoutGraph([], []);
    expect(r.nodes).toHaveLength(0);
    expect(r.width).toBe(0);
  });

  it("孤立节点也有有效坐标", () => {
    const r = layoutGraph([n("孤")], []);
    expect(r.nodes[0].x).toBeGreaterThanOrEqual(0);
    expect(r.nodes[0].height).toBe(NODE_HEIGHT);
  });
});

describe("时间轴布局", () => {
  it("按出生年份横向分布", () => {
    const nodes = [n("A", "MALE", 1900), n("B", "MALE", 1950), n("C", "MALE", 2000)];
    const r = layoutTimeline(nodes, [parent("A", "B"), parent("B", "C")]);
    expect(r.nodes[0].x).toBeLessThan(r.nodes[1].x);
    expect(r.nodes[1].x).toBeLessThan(r.nodes[2].x);
    expect(r.ticks).toHaveLength(6);
    expect(r.ticks[0].year).toBe(1900);
    expect(r.ticks[5].year).toBe(2000);
  });
});

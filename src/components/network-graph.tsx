"use client";

import { useEffect, useRef } from "react";
import type { LayoutNode, LayoutEdge } from "@/lib/graph-layout";

/** 人物关系网络图（ECharts force 布局）：展示家族整体关系，不推断未录入的关系。 */

type ChartHandle = {
  dispose: () => void;
  setOption: (o: unknown, notMerge?: boolean) => void;
  resize: () => void;
  on: (e: string, cb: (p: unknown) => void) => void;
};

/** ECharts 的 HTML tooltip 不会转义内容，姓名属于用户输入，必须自行转义。 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] ?? ch
  ));
}

function buildOption(nodes: LayoutNode[], edges: LayoutEdge[]) {
  const categories = [
    { name: "男性", itemStyle: { color: "#1b2a41" } },
    { name: "女性", itemStyle: { color: "#a63d2f" } },
    { name: "未知", itemStyle: { color: "#8a8f95" } },
  ];
  const catIndex = (g?: string) => g === "MALE" ? 0 : g === "FEMALE" ? 1 : 2;
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item", formatter: (p: unknown) => {
      const x = p as { dataType?: string; name?: string; data?: { label?: string } };
      return x.dataType === "node" ? `<strong>${escapeHtml(x.name ?? "")}</strong>` : escapeHtml(x.data?.label ?? "");
    } },
    legend: [{ data: categories.map((c) => c.name), top: 8, textStyle: { color: "#5a6069", fontSize: 11 } }],
    series: [{
      type: "graph",
      layout: "force",
      roam: true,
      draggable: true,
      data: nodes.map((n) => ({
        id: n.id, name: n.name, category: catIndex(n.gender),
        symbolSize: n.isFocus ? 46 : 32,
        label: { show: true, position: "right", color: "#191b1d", fontSize: 11 },
        itemStyle: { borderColor: "#f7f5ef", borderWidth: 2 },
      })),
      links: edges.map((e) => ({
        source: e.source, target: e.target,
        label: e.label,
        lineStyle: { color: e.type === "SPOUSE" ? "#b08d57" : e.type === "ADOPTION" ? "#3e6b6b" : "#aab0b5", width: e.type === "PARENT_CHILD" ? 2 : 1.4, type: e.type === "PARENT_CHILD" ? "solid" : "dashed" },
      })),
      categories,
      force: { repulsion: 320, edgeLength: [90, 180], gravity: 0.08, layoutAnimation: true },
      emphasis: { focus: "adjacency", lineStyle: { width: 3 } },
    }],
  };
}

export function NetworkGraph({
  nodes, edges, onSelect,
}: {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle | null>(null);
  // 回调与数据都通过 ref 读取：父组件每次渲染都会传入新的内联函数与数组，
  // 若放进 effect 依赖会导致图表被反复销毁重建（且重建后选项不再应用，画布空白）。
  const onSelectRef = useRef(onSelect);
  const dataRef = useRef({ nodes, edges });

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    dataRef.current = { nodes, edges };
  }, [nodes, edges]);

  useEffect(() => {
    let cancelled = false;
    let chart: ChartHandle | null = null;
    let observer: ResizeObserver | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (cancelled || !ref.current) return;
      chart = echarts.init(ref.current) as unknown as ChartHandle;
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
      chart.on("click", (p: unknown) => {
        const params = p as { dataType?: string; data?: { id?: string } };
        if (params.dataType === "node" && params.data?.id) onSelectRef.current?.(params.data.id);
      });
      // 初始化是异步的：首次渲染时下方的 setOption effect 已经跑过且图表还不存在，
      // 因此必须在创建图表后主动应用一次当前数据。
      chart.setOption(buildOption(dataRef.current.nodes, dataRef.current.edges), true);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(buildOption(nodes, edges), true);
  }, [nodes, edges]);

  return <div ref={ref} className="h-full w-full" role="img" aria-label="家族人物关系网络图" />;
}

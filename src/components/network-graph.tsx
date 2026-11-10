"use client";

import { useEffect, useRef } from "react";
import type { LayoutNode, LayoutEdge } from "@/lib/graph-layout";

/** 人物关系网络图（ECharts force 布局）：展示家族整体关系，不推断未录入的关系。 */
export function NetworkGraph({
  nodes, edges, onSelect,
}: {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ dispose: () => void; setOption: (o: unknown, notMerge?: boolean) => void; resize: () => void; on: (e: string, cb: (p: unknown) => void) => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const echarts = await import("echarts");
      if (cancelled || !ref.current) return;
      const chart = echarts.init(ref.current);
      chartRef.current = chart as unknown as typeof chartRef.current;
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(ref.current);
      chart.on("click", (p: unknown) => {
        const params = p as { dataType?: string; data?: { id?: string } };
        if (params.dataType === "node" && params.data?.id) onSelect?.(params.data.id);
      });
      return () => observer.disconnect();
    })();
    return () => { cancelled = true; chartRef.current?.dispose(); chartRef.current = null; };
  }, [onSelect]);

  useEffect(() => {
    if (!chartRef.current) return;
    const categories = [
      { name: "男性", itemStyle: { color: "#1b2a41" } },
      { name: "女性", itemStyle: { color: "#a63d2f" } },
      { name: "未知", itemStyle: { color: "#8a8f95" } },
    ];
    const catIndex = (g?: string) => g === "MALE" ? 0 : g === "FEMALE" ? 1 : 2;
    const option = {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: (p: unknown) => {
        const x = p as { dataType?: string; name?: string; data?: { label?: string } };
        return x.dataType === "node" ? `<strong>${x.name ?? ""}</strong>` : (x.data?.label ?? "");
      } },
      legend: [{ data: categories.map((c) => c.name), top: 8, textStyle: { color: "#5a6069", fontSize: 11 } }],
      animationDurationUpdate: 600,
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
    chartRef.current.setOption(option, true);
  }, [nodes, edges]);

  return <div ref={ref} className="h-full w-full" role="img" aria-label="家族人物关系网络图" />;
}

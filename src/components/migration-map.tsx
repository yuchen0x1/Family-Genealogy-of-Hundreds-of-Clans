"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client";
import { Badge, Card, CardBody, Select } from "@/components/ui/primitives";
import { evidenceLabel, reviewLabel } from "@/lib/utils";
import { Info } from "lucide-react";

type Place = { id: string; historicalName: string; modernName: string | null; longitude: number | null; latitude: number | null; reviewStatus: string };
type Migration = {
  id: string; dynasty: string | null; startYear: number | null; endYear: number | null;
  reason: string | null; narrative: string | null; evidenceLevel: string; reviewStatus: string;
  routePoints: unknown;
  fromPlace: Place | null; toPlace: Place | null;
  source: { id: string; title: string; author: string | null } | null;
  surname: { id: string; name: string } | null;
};

const LEVEL_COLORS: Record<string, string> = {
  DOCUMENTED: "#a63d2f",
  TRADITION: "#b08d57",
  INFERRED: "#3e6b6b",
  UNVERIFIED: "#8a8f95",
};

export function MigrationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ dispose: () => void; setOption: (o: unknown, notMerge?: boolean) => void; resize: () => void } | null>(null);
  const [level, setLevel] = useState("");
  const [selected, setSelected] = useState<Migration | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const params = new URLSearchParams({ pageSize: "100" });
  if (level) params.set("level", level);
  const { data: migrationData } = useSWR(`/api/migrations?${params.toString()}`, fetcher<{ items: Migration[]; total: number }>);
  const { data: placeData } = useSWR("/api/places?pageSize=100", fetcher<{ items: Place[] }>);
  const migrations = useMemo(() => migrationData?.items ?? [], [migrationData]);
  const places = useMemo(() => placeData?.items ?? [], [placeData]);

  const routes = useMemo(() => migrations
    .filter((m) => m.fromPlace?.longitude != null && m.fromPlace?.latitude != null && m.toPlace?.longitude != null && m.toPlace?.latitude != null)
    .map((m) => ({
      name: `${m.fromPlace!.historicalName} → ${m.toPlace!.historicalName}`,
      coords: [[Number(m.fromPlace!.longitude), Number(m.fromPlace!.latitude)], [Number(m.toPlace!.longitude), Number(m.toPlace!.latitude)]],
      lineStyle: { color: LEVEL_COLORS[m.evidenceLevel] ?? "#b08d57" },
      migration: m,
    })), [migrations]);

  const points = useMemo(() => places
    .filter((p) => p.longitude != null && p.latitude != null)
    .map((p) => ({ name: p.historicalName, value: [Number(p.longitude), Number(p.latitude)], modernName: p.modernName })), [places]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const echarts = await import("echarts");
      if (cancelled || !containerRef.current) return;
      const geoRes = await fetch("/geo/china.json");
      const geoJson = await geoRes.json();
      echarts.registerMap("xungen-china", geoJson as Parameters<typeof echarts.registerMap>[1]);
      const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
      chartRef.current = chart as unknown as typeof chartRef.current;
      setMapReady(true);

      const onResize = () => chart.resize();
      window.addEventListener("resize", onResize);
      const observer = new ResizeObserver(onResize);
      observer.observe(containerRef.current);
      return () => { window.removeEventListener("resize", onResize); observer.disconnect(); };
    })();
    return () => {
      cancelled = true;
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !chartRef.current) return;
    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(25,27,29,.94)",
        borderWidth: 0,
        textStyle: { color: "#f7f5ef", fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { seriesType?: string; name?: string; data?: { modernName?: string; name?: string } };
          if (p.seriesType === "effectScatter") {
            return `<strong>${p.name ?? ""}</strong><br/>${p.data?.modernName ?? "现代地名待补录"}<br/><span style="opacity:.6">坐标为现代治所近似位置</span>`;
          }
          if (p.seriesType === "lines") return `<strong>${p.data?.name ?? ""}</strong><br/><span style="opacity:.6">点击查看史料来源与可信程度</span>`;
          return p.name ?? "";
        },
      },
      geo: {
        map: "xungen-china",
        roam: true,
        zoom: 1.15,
        center: [104.5, 36],
        scaleLimit: { min: 0.8, max: 8 },
        itemStyle: { areaColor: "#e6ebe2", borderColor: "#9fb0a2", borderWidth: 0.6 },
        emphasis: { itemStyle: { areaColor: "#d9c8a4" }, label: { show: true, color: "#1b2a41", fontSize: 10 } },
        label: { show: false },
      },
      series: [
        {
          type: "lines",
          coordinateSystem: "geo",
          zlevel: 2,
          effect: { show: true, period: 6, trailLength: 0.35, symbol: "arrow", symbolSize: 6, color: "#b08d57" },
          lineStyle: { width: 1.8, opacity: 0.75, curveness: 0.22 },
          data: routes,
        },
        {
          type: "effectScatter",
          coordinateSystem: "geo",
          zlevel: 3,
          rippleEffect: { brushType: "stroke", scale: 2.5 },
          symbolSize: 7,
          itemStyle: { color: "#1b2a41" },
          data: points,
        },
      ],
    };
    chartRef.current.setOption(option, true);

    const el = containerRef.current;
    const onClick = (params: unknown) => {
      const p = params as { seriesType?: string; data?: { migration?: Migration } };
      if (p.seriesType === "lines" && p.data?.migration) setSelected(p.data.migration);
    };
    // echarts 事件绑定通过实例暴露（保持类型简洁）
    const chart = chartRef.current as unknown as { on: (e: string, cb: (p: unknown) => void) => void; off: (e: string, cb: (p: unknown) => void) => void };
    chart.on("click", onClick);
    return () => { chart.off("click", onClick); void el; };
  }, [mapReady, routes, points]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-44">
          <option value="">全部可信程度</option>
          <option value="DOCUMENTED">史料明确记载</option>
          <option value="TRADITION">地方传说</option>
          <option value="INFERRED">研究推测</option>
        </Select>
        <span className="text-xs text-graphite">共 {migrations.length} 条有来源的迁徙记录 · {points.length} 处古今地名</span>
        <div className="ml-auto flex flex-wrap gap-2 text-[11px] text-graphite">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cinnabar" /> 明确记载</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-gold" /> 地方传说</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-jade" /> 研究推测</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line bg-[#f0f3ed]">
        <div ref={containerRef} className="h-[420px] w-full md:h-[520px]" role="img" aria-label="中国历史迁徙与地名地图" />
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-white/85 px-3 py-2 text-[10px] leading-4 text-graphite backdrop-blur">
          底图：高德 DataV 官方行政区划数据（本地缓存，含台湾省、香港特别行政区、澳门特别行政区及国家轮廓岛屿要素）。
          地点坐标为现代治所近似位置，仅供示意，非考古定点；迁徙路线均需史料来源，系统不自动生成祖先路线。
        </div>
      </div>

      {selected && (
        <Card className="mt-4 border-gold/50">
          <CardBody>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-serif text-base font-semibold text-ink">
                {selected.fromPlace?.historicalName ?? "—"} → {selected.toPlace?.historicalName ?? "—"}
              </h3>
              <div className="flex gap-2">
                <Badge tone={selected.evidenceLevel === "DOCUMENTED" ? "jade" : "gold"}>{evidenceLabel(selected.evidenceLevel)}</Badge>
                <Badge tone="neutral">{reviewLabel(selected.reviewStatus)}</Badge>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-graphite">
              {selected.dynasty && <span>时代：{selected.dynasty}</span>}
              {selected.startYear && <span>起始：约 {selected.startYear} 年</span>}
              {selected.reason && <span>原因：{selected.reason}</span>}
              {selected.source && <span>来源：{selected.source.title}</span>}
            </div>
            {selected.narrative && <p className="mt-3 text-sm leading-7 text-ink-soft">{selected.narrative}</p>}
            <button onClick={() => setSelected(null)} className="mt-3 text-xs text-navy underline">收起详情</button>
          </CardBody>
        </Card>
      )}

      <Card className="mt-4 bg-[#faf6ec]">
        <CardBody className="flex items-start gap-2 text-xs leading-6 text-graphite">
          <Info className="mt-1 h-4 w-4 shrink-0 text-gold" />
          <span>迁徙记录仅收录有学术或档案依据的<strong className="text-ink">宏观人口流动</strong>。任何具体家族的祖先迁徙路线，必须由用户依据家谱、户籍或地方志录入并标注来源；平台不会凭空生成。</span>
        </CardBody>
      </Card>
    </div>
  );
}

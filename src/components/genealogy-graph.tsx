"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Search, ZoomIn, ZoomOut, Maximize2, ChevronUp, ChevronDown, Network, GitBranch, Clock3, Rows3, X, Info } from "lucide-react";
import { fetcher, apiRequest } from "@/lib/client";
import { layoutGraph, layoutTimeline, NODE_WIDTH, NODE_HEIGHT, type LayoutNode, type LayoutEdge } from "@/lib/graph-layout";
import { NetworkGraph } from "@/components/network-graph";
import { Badge, Card, CardBody, EmptyState, ErrorState, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

type GraphNode = {
  id: string; name: string; gender: string; birthYear: number | null; deathYear: number | null;
  isLiving: boolean; generationNumber: number | null; generationChar: string | null;
  branchId: string | null; visibility: string; isFocus: boolean;
};
type GraphEdge = { id: string; source: string; target: string; type: string; subtype: string; verification: string; label: string };
type GraphData = {
  nodes: GraphNode[]; edges: GraphEdge[]; focusId: string | null;
  totalMembers: number; totalRelations: number; hasMore: boolean; hasAccess: boolean; ignoredRelations: number;
};
type ViewMode = "vertical" | "horizontal" | "network" | "timeline";
type KinshipResult = {
  term: string; determined: boolean; description: string; alternatives: string[];
  variants: string[]; note?: string; includesAffinalOrAdoptive: boolean; notice?: string;
};

const VIEWS: Array<{ key: ViewMode; label: string; icon: typeof Network }> = [
  { key: "vertical", label: "传统家族树", icon: GitBranch },
  { key: "horizontal", label: "横向世系图", icon: Rows3 },
  { key: "network", label: "关系网络", icon: Network },
  { key: "timeline", label: "历史时间轴", icon: Clock3 },
];

const BRANCH_COLORS = ["#b08d57", "#3e6b6b", "#1b2a41", "#a63d2f", "#7a5b9a", "#5a6069"];

export function GenealogyGraph({ familyId, hasAccess, initialFocus }: {
  familyId: string; hasAccess: boolean; initialFocus?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<ViewMode>("vertical");
  const [focus, setFocus] = useState<string | null>(initialFocus ?? null);
  const [up, setUp] = useState(2);
  const [down, setDown] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [drag, setDrag] = useState<{ mode: "pan" | "node"; id?: string; sx: number; sy: number; px: number; py: number } | null>(null);
  const [kinshipLoading, setKinshipLoading] = useState(false);
  const [traceResult, setTraceResult] = useState<{ title: string; lines: string[] } | null>(null);

  const graphUrl = `/api/families/${familyId}/graph?focus=${focus ?? ""}&up=${up}&down=${down}`;
  const { data, isLoading, error, mutate } = useSWR<GraphData>(graphUrl, fetcher);
  const { data: kinship } = useSWR<KinshipResult>(
    selected && compareTo && selected !== compareTo
      ? `/api/families/${familyId}/kinship?from=${selected}&to=${compareTo}`
      : null,
    fetcher,
  );
  const { data: personDetail } = useSWR<{
    name: string; gender: string; isLiving: boolean; birthDateText: string | null;
    biography: string | null; relations: Array<{ direction: string; person: { id: string; givenName: string; surnameText: string }; type: string; subtype: string; verification: string }>;
  }>(selected ? `/api/families/${familyId}/members/${selected}` : null, fetcher);

  const nodes: LayoutNode[] = useMemo(() => (data?.nodes ?? []).map((n) => ({
    id: n.id, name: n.name, gender: n.gender, birthYear: n.birthYear,
    generationNumber: n.generationNumber, branchId: n.branchId, isFocus: n.isFocus,
  })), [data]);
  const edges: LayoutEdge[] = useMemo(() => (data?.edges ?? []).map((e) => ({
    id: e.id, source: e.source, target: e.target, type: e.type, subtype: e.subtype, label: e.label,
  })), [data]);

  const layout = useMemo(() => layoutGraph(nodes, edges, {
    orientation: view === "horizontal" ? "horizontal" : "vertical",
    collapsed,
  }), [nodes, edges, view, collapsed]);
  const timeline = useMemo(() => layoutTimeline(nodes, edges), [nodes, edges]);

  // 关系路径高亮（selected → compareTo 的最短链）
  const highlightEdges = useMemo(() => {
    if (!selected || !compareTo || selected === compareTo) return new Set<string>();
    const adj = new Map<string, Array<{ to: string; id: string }>>();
    for (const e of edges) {
      const push = (a: string, b: string) => {
        const arr = adj.get(a) ?? []; arr.push({ to: b, id: e.id }); adj.set(a, arr);
      };
      push(e.source, e.target); push(e.target, e.source);
    }
    const queue: Array<{ id: string; path: string[] }> = [{ id: selected, path: [] }];
    const seen = new Set([selected]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.id === compareTo) return new Set(cur.path);
      for (const nxt of adj.get(cur.id) ?? []) {
        if (seen.has(nxt.to)) continue;
        seen.add(nxt.to);
        queue.push({ id: nxt.to, path: [...cur.path, nxt.id] });
      }
    }
    return new Set<string>();
  }, [selected, compareTo, edges]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const box = view === "timeline" ? { width: timeline.width, height: timeline.height } : layout;
    if (!box.width || !box.height) return;
    const scale = Math.min((size.w - 60) / box.width, (size.h - 60) / box.height, 1.15);
    const z = Math.max(0.2, Math.min(1.5, scale));
    setZoom(z);
    setPan({ x: (size.w - box.width * z) / 2, y: (size.h - box.height * z) / 2 });
  }, [layout, timeline, size, view]);

  // fit 的最新版本保存在 ref 中，effect 只在视图或焦点变化时触发；
  // 通过浏览器动画帧回调执行，避免在 effect 主体同步 setState 造成级联渲染。
  const fitRef = useRef(fit);
  useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => {
    if (!data || !nodes.length) return;
    const frame = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.focusId, view]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (drag.mode === "pan") setPan({ x: drag.px + dx, y: drag.py + dy });
      else if (drag.id) {
        // px/py 在 node 模式下保存拖动开始时的既有偏移，避免多次拖动时节点跳回原点
        setOffsets((prev) => ({ ...prev, [drag.id!]: { dx: drag.px + dx, dy: drag.py + dy } }));
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag]);

  // 原生 wheel 监听（passive:false 才能 preventDefault）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setZoom((prev) => {
        const next = Math.max(0.2, Math.min(2.5, prev * (e.deltaY > 0 ? 0.9 : 1.1)));
        setPan((p) => ({ x: px - ((px - p.x) / prev) * next, y: py - ((py - p.y) / prev) * next }));
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const changeZoom = (factor: number) => setZoom((z) => Math.max(0.2, Math.min(2.5, z * factor)));

  const onNodeClick = (id: string) => {
    setSelected(id);
    setCompareTo("");
  };

  const searchNode = (e: React.FormEvent) => {
    e.preventDefault();
    const hit = nodes.find((n) => n.name.includes(searchText.trim()));
    if (!hit) return;
    setSelected(hit.id);
    setFocus(hit.id);
    void mutate();
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const colorOf = (n: LayoutNode) => {
    if (n.branchId) {
      const i = Array.from(new Set(nodes.map((x) => x.branchId).filter(Boolean))).indexOf(n.branchId);
      return BRANCH_COLORS[i % BRANCH_COLORS.length];
    }
    return n.gender === "FEMALE" ? "#a63d2f" : n.gender === "MALE" ? "#1b2a41" : "#5a6069";
  };

  // 视口渲染：只绘制可见区域内的节点与边，避免大型族谱一次性渲染全部 DOM
  const visibleRect = {
    left: -pan.x / zoom - 240, top: -pan.y / zoom - 160,
    right: (size.w - pan.x) / zoom + 240, bottom: (size.h - pan.y) / zoom + 160,
  };
  const visibleNodes = layout.nodes.filter((n) =>
    n.x + n.width >= visibleRect.left && n.x <= visibleRect.right &&
    n.y + n.height >= visibleRect.top && n.y <= visibleRect.bottom);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = layout.edges.filter((e) => visibleIds.has(e.source) || visibleIds.has(e.target));

  const showNetwork = view === "network";
  const showTimeline = view === "timeline";

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {/* Toolbar */}
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2">
          <div className="flex rounded-md border border-line p-0.5">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)} title={v.label}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] transition ${view === v.key ? "bg-navy text-white" : "text-ink-soft hover:bg-cream"}`}>
                <v.icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-line" />
          <Button variant="ghost" size="icon" onClick={() => changeZoom(1.2)} title="放大"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => changeZoom(0.83)} title="缩小"><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={fit} title="适配全图"><Maximize2 className="h-4 w-4" /></Button>
          {!showNetwork && !showTimeline && (
            <>
              <span className="text-[11px] text-graphite">{Math.round(zoom * 100)}%</span>
              <div className="ml-auto flex items-center gap-1 text-[11px] text-graphite">
                祖先 <button onClick={() => setUp((v) => Math.max(0, v - 1))} className="rounded border border-line p-0.5 hover:bg-cream"><ChevronDown className="h-3 w-3" /></button>
                <span className="w-4 text-center">{up}</span>
                <button onClick={() => setUp((v) => Math.min(5, v + 1))} className="rounded border border-line p-0.5 hover:bg-cream"><ChevronUp className="h-3 w-3" /></button>
                <span className="ml-2">后代</span>
                <button onClick={() => setDown((v) => Math.max(0, v - 1))} className="rounded border border-line p-0.5 hover:bg-cream"><ChevronDown className="h-3 w-3" /></button>
                <span className="w-4 text-center">{down}</span>
                <button onClick={() => setDown((v) => Math.min(5, v + 1))} className="rounded border border-line p-0.5 hover:bg-cream"><ChevronUp className="h-3 w-3" /></button>
              </div>
            </>
          )}
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <form onSubmit={searchNode} className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="在图谱中定位人物" className="h-8 w-full rounded-md border border-line bg-white pl-8 pr-2 text-xs focus:border-gold focus:outline-none" />
          </form>
          <span className="text-[11px] text-graphite">
            已加载 {data?.nodes.length ?? 0} / {data?.totalMembers ?? 0} 人 · {data?.edges.length ?? 0} 条关系
            {data?.hasMore ? "（按视野局部加载）" : ""}
          </span>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="graph-canvas graph-grid relative h-[520px] overflow-hidden rounded-xl border border-line bg-[#faf9f5]">
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <ErrorState title="图谱加载失败" description="族谱关系数据获取失败，网络恢复后可重试。" onRetry={() => mutate()} />
            </div>
          )}
          {!error && isLoading && <div className="absolute inset-0 flex items-center justify-center text-sm text-graphite">正在加载族谱图谱…</div>}
          {!error && !isLoading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <EmptyState title="族谱中还没有人物" description={hasAccess ? "在「人物管理」中添加人物并建立关系后，图谱会自动生成。" : "该家族暂无公开人物。"} />
            </div>
          )}

          {showNetwork && nodes.length > 0 && <NetworkGraph nodes={nodes} edges={edges} onSelect={onNodeClick} />}

          {!showNetwork && nodes.length > 0 && (
            <svg
              className="h-full w-full"
              onMouseDown={(e) => {
                if ((e.target as Element).closest("[data-node]")) return;
                setDrag({ mode: "pan", sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
                setSelected(null);
              }}
              role="img"
              aria-label={`家族关系${VIEWS.find((v) => v.key === view)?.label}`}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {showTimeline && (
                  <>
                    {timeline.ticks.map((t) => (
                      <g key={t.year}>
                        <line x1={t.x} y1={40} x2={t.x} y2={timeline.height - 30} stroke="#e2ddd0" strokeDasharray="4 4" />
                        <text x={t.x} y={28} textAnchor="middle" fontSize="11" fill="#5a6069">{t.year}</text>
                      </g>
                    ))}
                    {edges.filter((e) => e.type === "PARENT_CHILD").map((e) => {
                      const a = timeline.nodes.find((n) => n.id === e.source);
                      const b = timeline.nodes.find((n) => n.id === e.target);
                      if (!a || !b) return null;
                      return <path key={e.id} d={`M ${a.x + NODE_WIDTH / 2} ${a.y + NODE_HEIGHT} C ${a.x + NODE_WIDTH / 2} ${a.y + 90}, ${b.x + NODE_WIDTH / 2} ${b.y - 30}, ${b.x + NODE_WIDTH / 2} ${b.y}`} stroke="#c9c2b2" fill="none" strokeWidth="1.5" />;
                    })}
                    {timeline.nodes.map((n) => (
                      <NodeShape key={n.id} node={n} x={n.x} y={n.y} color={colorOf(n)} selected={selected === n.id}
                        focus={Boolean(n.isFocus)} onSelect={() => onNodeClick(n.id)} onDragStart={(ev) => {
                        const off = offsets[n.id] ?? { dx: 0, dy: 0 };
                        setDrag({ mode: "node", id: n.id, sx: ev.clientX, sy: ev.clientY, px: off.dx, py: off.dy });
                      }} />
                    ))}
                  </>
                )}
                {!showTimeline && (
                  <>
                    {visibleEdges.map((e) => (
                      <path key={e.id} d={e.path} stroke={highlightEdges.has(e.id) ? "#b08d57" : e.color}
                        strokeWidth={highlightEdges.has(e.id) ? 3.5 : 1.6} fill="none" strokeDasharray={e.dashed ? "6 4" : undefined}
                        opacity={highlightEdges.size && !highlightEdges.has(e.id) ? 0.25 : 0.85} />
                    ))}
                    {visibleNodes.map((n) => {
                      const off = offsets[n.id] ?? { dx: 0, dy: 0 };
                      const hasChildren = edges.some((e) => e.type === "PARENT_CHILD" && e.source === n.id);
                      return (
                        <NodeShape key={n.id} node={n} x={n.x + off.dx} y={n.y + off.dy} color={colorOf(n)}
                          selected={selected === n.id} focus={Boolean(n.isFocus)} highlight={compareTo === n.id}
                          onSelect={() => onNodeClick(n.id)}
                          onDragStart={(ev) => {
                        const off = offsets[n.id] ?? { dx: 0, dy: 0 };
                        setDrag({ mode: "node", id: n.id, sx: ev.clientX, sy: ev.clientY, px: off.dx, py: off.dy });
                      }}
                          collapsible={hasChildren} collapsed={collapsed.has(n.id)} onToggleCollapse={() => toggleCollapse(n.id)} />
                      );
                    })}
                  </>
                )}
              </g>
            </svg>
          )}

          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 text-[10px] text-graphite">
            <span className="rounded bg-white/90 px-2 py-1 shadow-sm">滚轮缩放 · 拖动空白平移 · 拖动节点调整位置</span>
            {data?.ignoredRelations ? <span className="rounded bg-white/90 px-2 py-1 shadow-sm">{data.ignoredRelations} 条未核实关系未参与布局</span> : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-graphite">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-4 bg-[#5a6069]" /> 生物学亲子</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-4 bg-[#b08d57]" /> 婚姻</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-4 bg-[#3e6b6b]" /> 收养（虚线）</span>
          <span>支系以节点色带区分</span>
        </div>
      </div>

      {/* 右侧人物面板 */}
      <aside className="space-y-3">
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-sm font-semibold text-ink">人物详情</h3>
              {selected && <button onClick={() => setSelected(null)} className="text-graphite hover:text-ink"><X className="h-4 w-4" /></button>}
            </div>
            {!selected && <p className="text-xs leading-6 text-graphite">点击图谱中的人物节点，可查看资料、追溯祖先、查询后代，并计算两人之间的已知亲属称谓。</p>}
            {selected && personDetail && (
              <div className="space-y-2 text-xs">
                <div className="font-serif text-lg text-ink">{personDetail.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={personDetail.gender === "FEMALE" ? "red" : "navy"}>{personDetail.gender === "FEMALE" ? "女" : personDetail.gender === "MALE" ? "男" : "未知"}</Badge>
                  <Badge tone="neutral">{personDetail.isLiving ? "在世" : "已故"}</Badge>
                  {personDetail.birthDateText && <Badge tone="gold">{personDetail.birthDateText}</Badge>}
                </div>
                {personDetail.biography && <p className="leading-6 text-graphite">{personDetail.biography}</p>}
                <div className="border-t border-line pt-2">
                  <div className="mb-1 font-medium text-ink-soft">已登记关系 {personDetail.relations.length} 条</div>
                  <ul className="max-h-32 space-y-1 overflow-y-auto">
                    {personDetail.relations.slice(0, 12).map((r, i) => (
                      <li key={i} className="flex justify-between gap-2 text-[11px] text-graphite">
                        <span>{r.person.surnameText}{r.person.givenName}</span>
                        <span>{r.type === "PARENT_CHILD" ? "亲子" : r.type === "SPOUSE" ? "配偶" : r.type === "ADOPTION" ? "收养" : r.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="mb-2 font-serif text-sm font-semibold text-ink">亲属称谓计算</h3>
            <p className="mb-3 text-[11px] leading-5 text-graphite">仅依据已核实关系；收养与婚姻不会被当作生物学血缘。</p>
            <label className="mb-1 block text-[11px] text-graphite">对比人物</label>
            <Select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} disabled={!selected} className="h-9 text-xs">
              <option value="">选择另一位人物…</option>
              {nodes.filter((n) => n.id !== selected).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </Select>
            {kinship && (
              <div className="mt-3 rounded-lg border border-gold/40 bg-[#faf6ec] p-3">
                <div className="font-serif text-xl text-navy">{kinship.term}</div>
                {kinship.determined && <div className="mt-1 text-[11px] text-graphite">{kinship.description}</div>}
                {kinship.variants.length > 1 && <div className="mt-2 text-[11px] text-graphite">亦称：{kinship.variants.join(" / ")}</div>}
                {kinship.alternatives.length > 0 && <div className="mt-1 text-[11px] text-graphite">其他可能：{kinship.alternatives.join("、")}</div>}
                {kinship.note && <div className="mt-2 text-[11px] leading-5 text-cinnabar">{kinship.note}</div>}
                {highlightEdges.size > 0 && <div className="mt-2 text-[11px] text-jade">已高亮关系链（{highlightEdges.size} 段）</div>}
              </div>
            )}
            {kinshipLoading && <div className="mt-2 text-xs text-graphite">计算中…</div>}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><Info className="h-3.5 w-3.5 text-gold" /> 追溯与图谱说明</h3>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start" disabled={!selected} onClick={async () => {
                if (!selected) return;
                setKinshipLoading(true);
                try {
                  const r = await apiRequest<{ groups: Array<{ generation: number; people: Array<{ name: string }> }> }>(`/api/families/${familyId}/kinship?ancestors=${selected}`);
                  setTraceResult({
                    title: `祖先追溯 · 共 ${r.groups.length} 代`,
                    lines: r.groups.map((g) => `第 ${g.generation} 代：${g.people.map((p) => p.name).join("、") || "—"}`),
                  });
                } catch (err) { setTraceResult({ title: "查询失败", lines: [err instanceof Error ? err.message : "未知错误"] }); }
                finally { setKinshipLoading(false); }
              }}>追溯祖先</Button>
              <Button variant="outline" size="sm" className="w-full justify-start" disabled={!selected} onClick={async () => {
                if (!selected) return;
                setKinshipLoading(true);
                try {
                  const r = await apiRequest<{ groups: Array<{ generation: number; people: Array<{ name: string }> }> }>(`/api/families/${familyId}/kinship?descendants=${selected}`);
                  setTraceResult({
                    title: `后代查询 · 共 ${r.groups.length} 代`,
                    lines: r.groups.map((g) => `第 ${g.generation} 代：${g.people.map((p) => p.name).join("、") || "—"}`),
                  });
                } catch (err) { setTraceResult({ title: "查询失败", lines: [err instanceof Error ? err.message : "未知错误"] }); }
                finally { setKinshipLoading(false); }
              }}>查询后代</Button>
              {selected && <Button variant="gold" size="sm" className="w-full" onClick={() => { setFocus(selected); void mutate(); }}>以此人为中心重新加载</Button>}
              {traceResult && (
                <div className="mt-3 rounded-lg border border-line bg-cream p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <strong className="text-[11px] text-ink">{traceResult.title}</strong>
                    <button onClick={() => setTraceResult(null)} className="text-graphite hover:text-ink"><X className="h-3 w-3" /></button>
                  </div>
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-[11px] leading-5 text-graphite">
                    {traceResult.lines.length ? traceResult.lines.map((l, i) => <li key={i}>{l}</li>) : <li>暂无已核实的血缘关系链</li>}
                  </ul>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function NodeShape({
  node, x, y, color, selected, focus, highlight, onSelect, onDragStart, collapsible, collapsed, onToggleCollapse,
}: {
  node: LayoutNode; x: number; y: number; color: string; selected?: boolean; focus?: boolean; highlight?: boolean;
  onSelect: () => void; onDragStart: (e: React.MouseEvent) => void;
  collapsible?: boolean; collapsed?: boolean; onToggleCollapse?: () => void;
}) {
  return (
    <g
      data-node="1"
      transform={`translate(${x},${y})`}
      onMouseDown={(e) => { e.stopPropagation(); onDragStart(e); }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ cursor: "grab" }}
    >
      <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="8"
        fill={selected ? "#fdf8ec" : "#ffffff"}
        stroke={selected ? "#b08d57" : highlight ? "#3e6b6b" : focus ? "#1b2a41" : "#e2ddd0"}
        strokeWidth={selected || focus ? 2.2 : 1.2}
        filter="drop-shadow(0 2px 4px rgba(25,27,29,.08))" />
      <rect width="5" height={NODE_HEIGHT} rx="2.5" fill={color} />
      <text x="16" y="27" fontSize="13" fontWeight="600" fill="#191b1d">{node.name.length > 9 ? `${node.name.slice(0, 9)}…` : node.name}</text>
      <text x="16" y="45" fontSize="10" fill="#7b837c">
        {node.generationNumber ? `第 ${node.generationNumber} 世` : "世系待确认"}{node.birthYear ? ` · ${node.birthYear}` : ""}
      </text>
      <text x={NODE_WIDTH - 12} y="20" fontSize="9" textAnchor="end" fill={color}>{node.gender === "FEMALE" ? "女" : node.gender === "MALE" ? "男" : "?"}</text>
      {collapsible && (
        <g onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }} style={{ cursor: "pointer" }}>
          <circle cx={NODE_WIDTH - 12} cy={NODE_HEIGHT - 12} r="8" fill="#f7f5ef" stroke="#c9c2b2" />
          <text x={NODE_WIDTH - 12} y={NODE_HEIGHT - 8} fontSize="11" textAnchor="middle" fill="#5a6069">{collapsed ? "+" : "−"}</text>
        </g>
      )}
    </g>
  );
}

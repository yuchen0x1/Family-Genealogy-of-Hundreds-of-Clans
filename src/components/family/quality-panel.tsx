"use client";

import { useState } from "react";
import useSWR from "swr";
import { ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState, ErrorState, Input } from "@/components/ui/primitives";
import type { QualityReport, QualitySeverity } from "@/lib/genealogy-quality";

const META = {
  ERROR: { label: "结构异常", tone: "red" },
  WARNING: { label: "待核对", tone: "gold" },
  INFO: { label: "待考证", tone: "neutral" },
} as const;

export function QualityPanel({ familyId }: { familyId: string }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<QualityReport>(
    `/api/families/${familyId}/quality`, fetcher, { revalidateOnFocus: false },
  );
  const [severity, setSeverity] = useState<"ALL" | QualitySeverity>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  if (error) return <ErrorState title="资料体检未完成" description={error.message} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <Card><CardBody><p role="status" className="flex items-center gap-2 text-sm text-graphite"><Loader2 className="h-4 w-4 animate-spin" />正在检查人物与关系资料…</p></CardBody></Card>;
  const visible = data.issues.filter((i) => (severity === "ALL" || i.severity === severity) &&
    `${i.message} ${i.people.map((p) => p.name).join(" ")}`.includes(query.trim()));
  const totalPages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, totalPages);
  return <div className="space-y-4">
    <Card><CardBody>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-2">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-ink"><ClipboardCheck className="h-5 w-5 text-jade" />资料体检</h2>
          <p className="text-sm leading-6 text-graphite">逐条核对年代、世代与关系结构。提示需结合原谱判断，系统不会自动修改资料或认定血缘。</p>
        </div>
        <Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}><RefreshCw className={`mr-1.5 h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />{isValidating ? "检查中…" : "重新检查"}</Button>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs leading-6 text-graphite">已检查 {data.scanned.members} 人、{data.scanned.relationships} 条关系；已否定关系 {data.scanned.rejectedRelationships} 条不参与检查。<br />检查时间：{new Date(data.checkedAt).toLocaleString("zh-CN")}</p>
    </CardBody></Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" aria-label="体检问题分类">
        {(["ALL", "ERROR", "WARNING", "INFO"] as const).map((key) => <button key={key} type="button" aria-pressed={severity === key}
          onClick={() => { setSeverity(key); setPage(1); }}
          className={`rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${severity === key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>
          {key === "ALL" ? "全部" : META[key].label} {key === "ALL" ? data.totalIssues : data.counts[key]}
        </button>)}
      </div>
      <Input className="w-full sm:w-64" aria-label="搜索体检问题" placeholder="按姓名或问题描述筛选" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
    </div>
    {data.truncated && <p role="status" className="rounded-md border border-gold bg-cream p-3 text-sm">共 {data.totalIssues} 条提示，优先展示前 {data.issueLimit} 条；筛选只覆盖这些条目。处理后请重新检查。</p>}
    {visible.length === 0 ? <EmptyState title={data.scanned.members === 0 ? "还没有人物资料" : data.totalIssues === 0 ? "本次检查未发现规则内异常" : "没有匹配的提示"}
      description={data.totalIssues === 0 ? "检查结果不代表史料已核实；仍需保留原始出处与人工判断。" : "尝试切换分类或清空搜索词。"} /> :
      <Card><ul className="divide-y divide-line">
        {visible.slice((currentPage - 1) * 20, currentPage * 20).map((issue) => <li key={issue.id} className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-3"><Badge tone={META[issue.severity].tone}>{META[issue.severity].label}</Badge><p className="min-w-0 text-sm leading-6 text-ink">{issue.message}</p></div>
          <div className="flex flex-wrap gap-3 text-sm">
            {issue.people.map((p) => <a key={p.id} href={`#tab=people&person=${encodeURIComponent(p.id)}`} className="text-navy underline underline-offset-4 focus-visible:outline-2">核对 {p.name}<span className="ml-1 text-xs text-graphite">（{p.id.slice(0, 8)}）</span></a>)}
            {issue.relationId && <a href={`#tab=relations&relation=${encodeURIComponent(issue.relationId)}`} className="text-navy underline underline-offset-4 focus-visible:outline-2">核对该关系</a>}
          </div>
        </li>)}
      </ul></Card>}
    {visible.length > 0 && <div className="flex items-center justify-between gap-2 text-sm">
      <span aria-live="polite">第 {currentPage} / {totalPages} 页 · 当前显示 {visible.length} 条</span>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页</Button></div>
    </div>}
  </div>;
}

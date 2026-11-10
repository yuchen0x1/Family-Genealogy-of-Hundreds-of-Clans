"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, FileUp, FileJson, FileSpreadsheet, FileText, Image as ImageIcon, FileType2, AlertTriangle, CheckCircle2, Info, History } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Input } from "@/components/ui/primitives";
import { Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";

type ImportReport = {
  format: string; fileName: string;
  counts: { persons: number; relations: number };
  missingFields: Array<{ row: number; field: string; note: string }>;
  duplicates: Array<{ name: string; rows: number[]; reason: string }>;
  conflicts: Array<{ type: string; detail: string }>;
  existingMatches: Array<{ name: string; existingId: string; reason: string }>;
  warnings: string[];
  ready: boolean;
};
type Preview = { jobId: string; report: ImportReport };
type CommitResult = {
  createdPersons: number; createdRelations: number;
  skipped: Array<{ index: number; reason: string }>; notice: string;
};
type JobRow = {
  id: string; format: string; fileName: string | null; status: string;
  createdAt: string; completedAt: string | null; report: ImportReport | null;
};

const EXPORTS = [
  { key: "JSON", label: "JSON", desc: "完整结构，可无损回导", icon: FileJson },
  { key: "CSV", label: "CSV", desc: "人物表，Excel 可直接打开", icon: FileSpreadsheet },
  { key: "GEDCOM551", label: "GEDCOM 5.5.1", desc: "通用族谱交换格式", icon: FileText },
  { key: "GEDCOM70", label: "GEDCOM 7.0", desc: "新版族谱交换格式", icon: FileText },
  { key: "SVG", label: "SVG 图谱", desc: "矢量家族关系图", icon: ImageIcon },
  { key: "PNG", label: "PNG 图谱", desc: "位图家族关系图", icon: ImageIcon },
  { key: "PDF", label: "PDF 图谱", desc: "可打印家族关系图", icon: FileType2 },
] as const;

const EXT: Record<string, string> = { JSON: "json", CSV: "csv", GEDCOM551: "ged", GEDCOM70: "ged", SVG: "svg", PNG: "png", PDF: "pdf" };

export function ImportExportPanel({ familyId, canWrite, onChanged }: {
  familyId: string; canWrite: boolean; onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const { data: jobs, mutate: mutateJobs } = useSWR<JobRow[]>(canWrite ? `/api/families/${familyId}/import` : null, fetcher);

  const exportFile = async (format: string) => {
    setBusy(format); setNotice(null);
    try {
      const res = await fetch(`/api/families/${familyId}/export?format=${format}`, {
        method: "POST", credentials: "same-origin", headers: { Origin: window.location.origin },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error?.message || `导出失败 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xungen-${familyId.slice(0, 8)}.${EXT[format]}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setNotice({ kind: "success", title: `${format} 导出完成`, lines: [`文件大小 ${(blob.size / 1024).toFixed(1)} KB；导出内容不含人物加密敏感资料。`] });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(null); }
  };

  const previewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setNotice({ kind: "error", title: "请选择导入文件" }); return; }
    setBusy("import"); setNotice(null); setPreview(null); setCommitResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiRequest<Preview>(`/api/families/${familyId}/import`, { method: "POST", formData: fd });
      setPreview(r);
      const suggested = new Set<number>();
      for (const d of r.report.duplicates) d.rows.slice(1).forEach((n) => suggested.add(n));
      setSkipRows(suggested);
      setNotice({ kind: r.report.ready ? "success" : "warning", title: r.report.ready ? "解析完成，请核对报告后再导入" : "解析完成，但没有可导入的人物" });
      void mutateJobs();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(null); }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy("commit"); setNotice(null);
    try {
      const r = await apiRequest<CommitResult>(`/api/families/${familyId}/import/${preview.jobId}/commit`, {
        method: "POST", body: { confirm: "IMPORT", skipRows: Array.from(skipRows) },
      });
      setCommitResult(r);
      setNotice({ kind: "success", title: "导入完成", lines: [`新增 ${r.createdPersons} 位人物、${r.createdRelations} 条未核实关系。`, r.notice] });
      void mutateJobs();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(null); }
  };

  const toggleRow = (n: number) => setSkipRows((prev) => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink">族谱导入导出</h2>
        <p className="mt-1 text-xs text-graphite">导出不含加密敏感字段；导入必须先生成预览报告，经人工确认后才会写入，所有导入关系默认「未核实」。</p>
      </div>
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {!canWrite && <Notice data={{ kind: "warning", title: "只读权限", lines: ["导出与导入需要家族编辑权限；服务端也会独立校验。"] }} />}

      <Card>
        <CardHeader><h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><Download className="h-4 w-4 text-gold" />导出族谱</h3><p className="mt-1 text-[11px] text-graphite">仅家族协作者可导出，防止公开访客批量获取人物与家庭资料。</p></CardHeader>
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {EXPORTS.map((f) => (
              <button key={f.key} disabled={!canWrite || busy !== null} onClick={() => void exportFile(f.key)}
                className="card-hover flex items-start gap-2 rounded-lg border border-line bg-white p-3 text-left disabled:cursor-not-allowed disabled:opacity-50">
                <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span><span className="block text-xs font-medium text-ink">{f.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-graphite">{f.desc}</span></span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><FileUp className="h-4 w-4 text-gold" />导入族谱</h3><p className="mt-1 text-[11px] text-graphite">支持 GEDCOM 5.5.1 / 7.0、CSV、JSON。同名或同姓人物不会自动合并。</p></CardHeader>
        <CardBody className="space-y-3">
          <form onSubmit={previewFile} className="flex flex-wrap items-center gap-2">
            <Input type="file" accept=".ged,.csv,.json,.txt" disabled={!canWrite} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto max-w-[320px] py-2 text-xs" />
            <Button size="sm" variant="gold" type="submit" disabled={!canWrite} loading={busy === "import"}>解析并生成报告</Button>
            {file && <span className="text-[11px] text-graphite">已选择：{file.name}</span>}
          </form>

          {preview && <div className="space-y-3 rounded-lg border border-line bg-cream/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="navy">{preview.report.format}</Badge>
              <span className="text-xs text-ink">{preview.report.fileName}</span>
              <Badge tone="gold">人物 {preview.report.counts.persons}</Badge>
              <Badge tone="gold">关系 {preview.report.counts.relations}</Badge>
              <span className="ml-auto text-[11px] text-graphite">任务 {preview.jobId.slice(0, 8)}…</span>
            </div>

            {preview.report.warnings.map((w, i) => <p key={i} className="flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3 w-3 shrink-0 text-gold" />{w}</p>)}

            {preview.report.conflicts.length > 0 && <div>
              <h4 className="mb-1.5 flex items-center gap-1 text-xs font-medium text-cinnabar"><AlertTriangle className="h-3.5 w-3.5" />冲突与将跳过的条目（{preview.report.conflicts.length}）</h4>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-[11px] leading-5 text-graphite">{preview.report.conflicts.slice(0, 20).map((c, i) => <li key={i}>· [{c.type}] {c.detail}</li>)}</ul>
            </div>}

            {preview.report.duplicates.length > 0 && <div>
              <h4 className="mb-1.5 text-xs font-medium text-ink">文件内疑似重复人物（可勾选跳过）</h4>
              <ul className="space-y-1.5">{preview.report.duplicates.map((d, i) => (
                <li key={i} className="rounded border border-line bg-white px-2.5 py-2 text-[11px] leading-5">
                  <div className="text-ink">{d.name} · 行 {d.rows.join("、")}</div>
                  <div className="text-graphite">{d.reason}</div>
                  <div className="mt-1 flex flex-wrap gap-2">{d.rows.map((n) => (
                    <label key={n} className="inline-flex items-center gap-1 text-graphite">
                      <input type="checkbox" checked={skipRows.has(n)} onChange={() => toggleRow(n)} className="accent-[#b08d57]" />跳过第 {n} 行
                    </label>
                  ))}</div>
                </li>
              ))}</ul>
            </div>}

            {preview.report.existingMatches.length > 0 && <div>
              <h4 className="mb-1.5 text-xs font-medium text-ink">与现有资料疑似匹配（仅提示，绝不自动合并）</h4>
              <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-graphite">{preview.report.existingMatches.map((m, i) => <li key={i}>· {m.name}：{m.reason}</li>)}</ul>
            </div>}

            {preview.report.missingFields.length > 0 && <div>
              <h4 className="mb-1.5 text-xs font-medium text-ink">缺失字段（{preview.report.missingFields.length}）</h4>
              <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-graphite">{preview.report.missingFields.slice(0, 20).map((m, i) => <li key={i}>· 第 {m.row} 行 · {m.field}：{m.note}</li>)}</ul>
            </div>}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button size="sm" variant="gold" disabled={!preview.report.ready || busy !== null} loading={busy === "commit"} onClick={() => void commit()}>
                <CheckCircle2 className="h-3.5 w-3.5" />确认导入（跳过 {skipRows.size} 行）
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setPreview(null); setCommitResult(null); }}>取消</Button>
              <span className="text-[11px] text-graphite">写入在单个事务中完成，并自动生成版本快照。</span>
            </div>
          </div>}

          {commitResult && <div className="rounded-lg border border-[#c6dedb] bg-[#eef6f4] p-3 text-xs leading-6 text-[#2f5a58]">
            <div className="font-medium">已写入 {commitResult.createdPersons} 位人物、{commitResult.createdRelations} 条关系</div>
            {commitResult.skipped.length > 0 && <div>跳过 {commitResult.skipped.length} 条关系（重复、悬空引用或冲突）</div>}
            <div>{commitResult.notice}</div>
          </div>}
        </CardBody>
      </Card>

      {canWrite && jobs && jobs.length > 0 && <Card>
        <CardHeader><h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><History className="h-4 w-4 text-gold" />最近的导入任务</h3></CardHeader>
        <CardBody className="p-0"><ul className="divide-y divide-line/70">{jobs.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
            <span className="text-ink">{j.fileName || j.format}</span>
            <Badge tone="neutral">{j.format}</Badge>
            <Badge tone={j.status === "COMPLETED" ? "jade" : j.status === "FAILED" ? "red" : "gold"}>{j.status}</Badge>
            {j.report?.counts && <span className="text-[11px] text-graphite">{j.report.counts.persons} 人 / {j.report.counts.relations} 关系</span>}
            <span className="ml-auto text-[11px] text-graphite">{formatDate(j.createdAt)}</span>
          </li>
        ))}</ul></CardBody>
      </Card>}
    </div>
  );
}

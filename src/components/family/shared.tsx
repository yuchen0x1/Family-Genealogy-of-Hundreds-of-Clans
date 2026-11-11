"use client";

import { useCallback, useState } from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NoticeData = { kind: "success" | "error" | "warning"; title: string; lines?: string[] };

/** 把服务端结构化错误（关系冲突报告 / Zod 校验明细）转成可读提示。 */
export function parseError(err: unknown): NoticeData {
  const e = err as Error & { details?: unknown };
  const lines: string[] = [];
  const d = e?.details as Record<string, unknown> | undefined;
  if (d && typeof d === "object") {
    if (Array.isArray(d.errors)) {
      for (const item of d.errors) if (typeof item === "string") lines.push(item);
    }
    if (Array.isArray(d.warnings)) {
      for (const item of d.warnings) if (typeof item === "string") lines.push(`提示：${item}`);
    }
    const fieldErrors = d.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (Array.isArray(msgs)) lines.push(`${key}：${msgs.join("；")}`);
      }
    }
    if (Array.isArray(d.formErrors)) {
      for (const item of d.formErrors) if (typeof item === "string") lines.push(item);
    }
  }
  return { kind: "error", title: e?.message || "操作失败，请重试", lines };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, successText?: string): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (successText) setNotice({ kind: "success", title: successText });
      return true;
    } catch (err) {
      setNotice(parseError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, notice, setNotice, run };
}

export function Notice({ data, onClose }: { data: NoticeData | null; onClose?: () => void }) {
  if (!data) return null;
  const Icon = data.kind === "success" ? CheckCircle2 : data.kind === "warning" ? AlertTriangle : AlertCircle;
  return (
    <div className={cn(
      "rounded-lg border px-3.5 py-3 text-xs",
      data.kind === "success" && "border-[#c6dedb] bg-[#eef6f4] text-[#2f5a58]",
      data.kind === "warning" && "border-[#e5d3ae] bg-[#faf4e6] text-[#8a6a35]",
      data.kind === "error" && "border-[#edcdc7] bg-[#fbeeeb] text-[#93382c]",
    )} role="status">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{data.title}</div>
          {data.lines && data.lines.length > 0 && (
            <ul className="mt-1.5 space-y-1 leading-5 opacity-90">
              {data.lines.slice(0, 12).map((line, i) => <li key={i}>· {line}</li>)}
            </ul>
          )}
        </div>
        {onClose && <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="关闭提示"><X className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}

export function Modal({
  open, onClose, title, description, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 py-10 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className={cn("w-full rounded-xl border border-line bg-white shadow-lift", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
            {description && <p className="mt-1 text-xs leading-5 text-graphite">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-graphite hover:bg-cream hover:text-ink" aria-label="关闭"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-cream/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-4 text-graphite">{hint}</p>}
    </div>
  );
}

export function Pager({ page, totalPages, total, onPage }: {
  page: number; totalPages: number; total: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1 && total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[11px] text-graphite">
      <span>共 {total} 条 · 第 {page} / {Math.max(1, totalPages)} 页</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" />上一页</Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页<ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "私有", FAMILY: "家族可见", PUBLIC: "公开",
};
export const VERIFICATION_LABELS: Record<string, string> = {
  UNVERIFIED: "未核实", PENDING: "待审核", VERIFIED: "已核实", DISPUTED: "存疑", REJECTED: "已驳回",
};
export const RELATION_LABELS: Record<string, string> = {
  PARENT_CHILD: "亲子", SPOUSE: "配偶", SIBLING: "兄弟姐妹", ADOPTION: "收养",
  SUCCESSION: "过继 / 继承", GUARDIANSHIP: "监护", CROSS_FAMILY_LINK: "跨家族关联",
};
export const SUBTYPE_LABELS: Record<string, string> = {
  BIOLOGICAL: "生物学", ADOPTIVE: "收养", STEP: "继亲", FOSTER: "寄养", FULL: "同父母",
  HALF_PATERNAL: "同父异母", HALF_MATERNAL: "同母异父", MARRIAGE: "婚姻", CONCUBINAGE: "妾室", UNKNOWN: "未明确",
};
export const EVIDENCE_LABELS: Record<string, string> = {
  DOCUMENTED: "有文献记载", TRADITION: "族人口述 / 传统", INFERRED: "推断", UNVERIFIED: "未核实",
};

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatBytesSafe(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  OLD_GENEALOGY: "老族谱", PHOTO: "照片", HISTORICAL_DOCUMENT: "历史文书",
  PDF: "PDF 文档", TEXT: "文本资料", AUDIO: "音频", VIDEO: "视频", OTHER: "其他",
};

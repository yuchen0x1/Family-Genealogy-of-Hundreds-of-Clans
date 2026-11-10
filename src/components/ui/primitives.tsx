import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-white shadow-paper", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-line/70 px-5 py-4", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "jade" | "red" | "navy";
  className?: string;
}) {
  const tones = {
    neutral: "bg-cream-dark text-graphite border-line",
    gold: "bg-[#f6efdf] text-[#8a6a35] border-[#e5d3ae]",
    jade: "bg-[#e8f1ef] text-[#2f5a58] border-[#c6dedb]",
    red: "bg-[#f9eae7] text-[#93382c] border-[#edcdc7]",
    navy: "bg-[#e9edf4] text-navy border-[#cdd7e7]",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <div className="mb-2 text-xs font-semibold tracking-[0.25em] text-gold">{eyebrow}</div>}
        <h2 className="font-serif text-2xl font-semibold tracking-wide text-ink md:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <div className="mb-3 font-serif text-3xl text-gold">◈</div>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-graphite">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** 请求失败态：与空状态明确区分，提供重试入口，避免永久转圈或被误显示为「暂无数据」。 */
export function ErrorState({
  title = "加载失败",
  description = "网络或服务暂时不可用，请稍后重试。",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-[#edcdc7] bg-[#f9eae7]/50 px-6 py-12 text-center", className)}
    >
      <div className="mb-3 font-serif text-3xl text-[#93382c]">⚠</div>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-graphite">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-line bg-white px-4 py-2 text-sm text-ink transition-colors hover:bg-cream-dark focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          重新加载
        </button>
      )}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-graphite/60 transition-colors focus:border-gold focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-graphite/60 transition-colors focus:border-gold focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink transition-colors focus:border-gold focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-ink-soft", className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("gold-rule my-6", className)} />;
}

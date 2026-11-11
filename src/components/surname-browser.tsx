"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { fetcher } from "@/lib/client";
import { Badge, EmptyState, ErrorState, Input, Select } from "@/components/ui/primitives";
import { evidenceLabel, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Item = {
  id: string; name: string; pinyin: string; traditional: string | null;
  category: string; popularityRank: number | null; originSummary: string | null;
  credibility: string; reviewStatus: string; viewCount: number;
};

const LETTERS = "ABCDEFGHJKLMNOPQRSTWXYZ".split("");

export function SurnameBrowser() {
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("");
  const [letter, setLetter] = useState("");
  const [detail, setDetail] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
  if (category) params.set("category", category);
  if (letter) params.set("letter", letter);
  if (detail) params.set("detail", detail);
  const { data, isLoading, error, mutate } = useSWR(`/api/surnames?${params.toString()}`, fetcher<{
    items: Item[]; total: number; page: number; pageSize: number; totalPages: number;
  }>);

  const applySearch = (e: React.FormEvent) => { e.preventDefault(); setQ(input.trim()); setPage(1); };

  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-4 shadow-paper">
        <form onSubmit={applySearch} className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="姓氏 / 拼音 / 繁体 / 异体字" className="pl-9" />
          </div>
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-36" aria-label="姓氏类别">
            <option value="">全部类别</option>
            <option value="SINGLE">单姓</option>
            <option value="COMPOUND">复姓</option>
          </Select>
          <Select value={detail} onChange={(e) => { setDetail(e.target.value); setPage(1); }} className="w-40" aria-label="资料范围">
            <option value="">全部资料范围</option>
            <option value="documented">含史料出处</option>
            <option value="dictionary">字典型条目</option>
          </Select>
          <Button type="submit">检索</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-graphite">拼音首字母：</span>
          <button onClick={() => { setLetter(""); setPage(1); }} className={`rounded px-2 py-1 text-xs ${!letter ? "bg-navy text-white" : "bg-cream-dark text-ink-soft hover:bg-cream"}`}>全部</button>
          {LETTERS.map((l) => (
            <button key={l} onClick={() => { setLetter(l); setPage(1); }} className={`rounded px-2 py-1 text-xs ${letter === l ? "bg-navy text-white" : "bg-cream-dark text-ink-soft hover:bg-cream"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div role="note" className="mt-3 rounded-xl border border-line bg-cream px-4 py-3 text-xs leading-6 text-graphite">
        <span className="font-medium text-navy">资料说明：</span>
        本库收录《百家姓》通行本全表 504 姓（444 单姓 + 60 复姓）。其中 <strong className="text-navy">38 姓</strong>含已审定的史料出处、郡望堂号与来源引用；其余 <strong className="text-navy">466 姓</strong>为字典型条目，仅收录可核验的字形、繁体写法、姓氏专用读音与《百家姓》序位，得姓源流、历史人物及卷次页码尚待补录，<strong className="text-navy">暂不作任何史实陈述</strong>。可用「资料范围」筛选查看。
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-graphite">
        <span>共 {data?.total ?? "…"} 个姓氏条目{detail === "documented" ? "（含史料出处）" : detail === "dictionary" ? "（字典型条目）" : ""}</span>
        <span>排序：《百家姓》序位（非现代人口排名）</span>
      </div>

      {error && <div className="mt-4"><ErrorState description="姓氏资料加载失败，请稍后重试。" onRetry={() => mutate()} /></div>}
      {!error && isLoading && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}</div>}
      {!error && !isLoading && data?.items.length === 0 && <div className="mt-4"><EmptyState title="未找到匹配的姓氏" description="可尝试拼音、繁体或异体字；也可在后台持续录入新的姓氏资料。" /></div>}

      {data && data.items.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((s, i) => {
              // 字典型条目有《百家姓》序位但没有史料关联。这里明确写「源流待补录」，
              // 避免把 UNVERIFIED 直接显示成「待核实」而让用户误以为字形/读音本身不可信。
              const isDictionary = s.reviewStatus === "PENDING" && s.credibility === "UNVERIFIED";
              return (
                <Link key={s.id} href={`/surnames/${encodeURIComponent(s.name)}`} className="card-hover animate-fade-up rounded-xl border border-line bg-white p-5 shadow-paper" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="flex items-start justify-between">
                    <span className="font-serif text-4xl text-navy">{s.name}</span>
                    <Badge tone={s.category === "COMPOUND" ? "navy" : "neutral"}>{s.category === "COMPOUND" ? "复姓" : "单姓"}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-gold">{s.pinyin}{s.traditional ? ` · 繁体 ${s.traditional}` : ""}</div>
                  <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[12px] leading-5 text-graphite">
                    {isDictionary ? "字典型条目：字形、繁体、读音与序位已核，得姓源流待补录。" : truncate(s.originSummary ?? "暂无起源摘要", 60)}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-3">
                    <Badge tone={isDictionary ? "neutral" : s.credibility === "TRADITION" ? "red" : s.credibility === "INFERRED" ? "gold" : s.credibility === "DOCUMENTED" ? "jade" : "neutral"}>
                      {isDictionary ? "源流待补录" : evidenceLabel(s.credibility)}
                    </Badge>
                    <span className="text-[11px] text-graphite/70">{s.popularityRank ? `第 ${s.popularityRank} 位` : "未入《百家姓》"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> 上一页</Button>
            <span className="text-xs text-graphite">{data.page} / {data.totalPages || 1}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>下一页 <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </>
      )}
    </div>
  );
}

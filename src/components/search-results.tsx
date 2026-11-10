"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search, ShieldCheck } from "lucide-react";
import { fetcher } from "@/lib/client";
import { Badge, Card, CardBody, EmptyState, ErrorState, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

type Item = { id: string; title: string; subtitle?: string; href: string; badge?: string; extra?: string };
type Group = { key: string; label: string; total: number; items: Item[] };
type Result = { query: string; total: number; groups: Group[]; tookMs: number; notice: string };

const CATEGORIES = [
  { key: "", label: "全部" },
  { key: "surnames", label: "姓氏资料" },
  { key: "figures", label: "历史人物" },
  { key: "places", label: "地名" },
  { key: "sources", label: "古籍" },
  { key: "families", label: "族谱" },
  { key: "members", label: "人物" },
  { key: "posts", label: "寻亲" },
];

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");

  const params = new URLSearchParams({ q: query, limit: "12" });
  if (category) params.set("category", category);
  const { data, isLoading, error, mutate } = useSWR<Result>(query ? `/api/search?${params.toString()}` : null, fetcher);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
    router.replace(`/search?q=${encodeURIComponent(input.trim())}`);
  };

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="姓氏、拼音、历史人物、祖籍、家族、文献…" className="h-11 pl-9" />
        </div>
        <Button type="submit" size="lg">搜索</Button>
      </form>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${category === c.key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-soft hover:border-gold"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {data && (
        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-graphite">
          <span>「<strong className="text-ink">{data.query}</strong>」共 {data.total} 条结果 · {data.tookMs} ms</span>
          <span className="inline-flex items-center gap-1 text-jade"><ShieldCheck className="h-3.5 w-3.5" /> {data.notice}</span>
        </div>
      )}

      {error && <div className="mt-6"><ErrorState title="搜索失败" description="检索服务暂时不可用，请稍后重试；也可以换个关键词。" onRetry={() => mutate()} /></div>}

      {!error && isLoading && <div className="mt-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>}

      {data && data.total === 0 && !isLoading && !error && (
        <div className="mt-6"><EmptyState title="没有找到匹配内容" description="可以尝试更短的关键词、拼音首字母，或切换到「全部」分类。私有族谱中的人物不会被搜索到。" /></div>
      )}

      <div className="mt-6 space-y-8">
        {data?.groups.filter((g) => g.total > 0 || g.items.length > 0).map((g) => (
          <section key={g.key}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-serif text-lg font-semibold text-ink">{g.label}</h2>
              <Badge tone="neutral">{g.total}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {g.items.map((item) => (
                <Link key={`${g.key}-${item.id}`} href={item.href} className="card-hover rounded-lg border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-sm font-semibold text-ink">{item.title}</h3>
                    {item.badge && <Badge tone="gold">{item.badge}</Badge>}
                  </div>
                  {item.subtitle && <div className="mt-1 text-[11px] text-gold">{item.subtitle}</div>}
                  {item.extra && <p className="mt-2 text-xs leading-5 text-graphite">{item.extra}</p>}
                </Link>
              ))}
            </div>
            {g.total > g.items.length && <p className="mt-2 text-[11px] text-graphite">仅显示前 {g.items.length} 条，共 {g.total} 条；可使用分类筛选缩小范围。</p>}
          </section>
        ))}
      </div>

      {!query && <Card className="mt-6"><CardBody className="text-xs leading-6 text-graphite">搜索支持中文分词（2-gram）、拼音全拼与首字母、异体字与繁体字。结果按历史资料、历史人物、祖籍地名、古籍来源、用户族谱、族谱人物与寻亲信息分类展示。</CardBody></Card>}
    </div>
  );
}

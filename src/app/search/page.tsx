import type { Metadata } from "next";
import { SearchResults } from "@/components/search-results";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "全站搜索" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="paper-bg min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6">
        <div className="mb-7">
          <div className="text-xs tracking-[0.3em] text-gold">UNIFIED SEARCH</div>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">全站搜索</h1>
          <p className="mt-2 text-sm text-graphite">姓氏资料 · 历史人物 · 古今地名 · 古籍来源 · 家族族谱 · 寻亲信息，结果按权限过滤。</p>
        </div>
        <SearchResults initialQuery={(q ?? "").slice(0, 200)} />
      </div>
    </div>
  );
}

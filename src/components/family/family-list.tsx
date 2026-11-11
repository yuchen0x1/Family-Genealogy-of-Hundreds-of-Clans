"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Plus, Lock, Users, GitBranch, ArrowUpRight, BookOpen } from "lucide-react";
import { fetcher, type MeResponse } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input } from "@/components/ui/primitives";
import { Notice, Pager, VISIBILITY_LABELS, formatDate } from "@/components/family/shared";

type FamilyItem = {
  id: string; name: string; surnameText: string; ancestralHome: string | null;
  hallName: string | null; description: string | null; visibility: string;
  isDemo: boolean; createdAt: string;
  _count: { members: number; relationships: number };
};
type ListData = { items: FamilyItem[]; total: number; page: number; pageSize: number; totalPages: number };

export function FamilyList({ initialMine }: { initialMine: boolean }) {
  const [mine, setMine] = useState(initialMine);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetcher);

  const url = `/api/families?${mine ? "mine=1&" : ""}page=${page}&keyword=${encodeURIComponent(query)}`;
  const { data, error, isLoading, mutate } = useSWR<ListData>(url, fetcher, { keepPreviousData: true });

  const switchTab = (next: boolean) => { setMine(next); setPage(1); setQuery(""); setKeyword(""); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); setQuery(keyword.trim()); setPage(1); };

  const unauthorized = mine && !me?.authenticated;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-white p-1">
          <button onClick={() => switchTab(false)} className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${!mine ? "bg-navy text-white" : "text-ink-soft hover:bg-cream"}`}>公开族谱</button>
          <button onClick={() => switchTab(true)} className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${mine ? "bg-navy text-white" : "text-ink-soft hover:bg-cream"}`}>我的族谱</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={submit} className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按家族名称检索" className="h-9 w-44 pl-8 text-xs sm:w-56" />
          </form>
          <Button size="sm" onClick={() => void mutate()} variant="outline">刷新</Button>
          <Link href={me?.authenticated ? "/families/new" : "/login?next=/families/new"}>
            <Button size="sm" variant="gold"><Plus className="h-3.5 w-3.5" />创建族谱</Button>
          </Link>
        </div>
      </div>

      {mine && (
        <div className="mb-4 rounded-lg border border-line bg-white/70 px-4 py-3 text-xs leading-6 text-graphite">
          <Lock className="mr-1.5 inline h-3.5 w-3.5 text-gold" />
          私有族谱仅创建者与受邀协作者可见，不会出现在公开列表或全站搜索结果中。家族权限分为所有者、管理员、编辑者与浏览者。
        </div>
      )}

      {unauthorized && (
        <Notice data={{ kind: "warning", title: "查看「我的族谱」需要先登录", lines: ["登录后可以看到自己创建或被邀请协作的私有族谱。"] }} />
      )}

      {error && !unauthorized && (
        <Notice data={{ kind: "error", title: error instanceof Error ? error.message : "列表加载失败" }} />
      )}

      {isLoading && !data && <div className="skeleton h-40 rounded-xl" />}

      {!isLoading && data && data.items.length === 0 && !unauthorized && (
        <EmptyState
          title={mine ? "你还没有创建或参与任何族谱" : query ? "没有找到符合条件的公开族谱" : "目前还没有公开族谱"}
          description={mine ? "创建一份家族族谱，添加人物与关系后即可生成家族关系图谱。新建族谱默认私有。" : "公开族谱由用户主动发布；平台不会自动公开任何私人家族资料。"}
          action={mine && me?.authenticated ? <Link href="/families/new"><Button variant="gold" size="sm"><Plus className="h-3.5 w-3.5" />创建族谱</Button></Link> : undefined}
        />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((f) => (
              <Link key={f.id} href={`/families/${f.id}`} className="card-hover group flex flex-col rounded-lg border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-base font-semibold text-ink group-hover:text-navy">{f.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="navy">{f.surnameText}姓</Badge>
                      {f.hallName && <Badge tone="gold">{f.hallName}</Badge>}
                      {f.visibility !== "PUBLIC" && <Badge tone="neutral"><Lock className="h-2.5 w-2.5" />{VISIBILITY_LABELS[f.visibility]}</Badge>}
                      {f.isDemo && <Badge tone="red">演示数据</Badge>}
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-gold opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-graphite">
                  {f.description || (f.ancestralHome ? `祖籍：${f.ancestralHome}` : "尚未填写家族简介")}
                </p>
                <div className="mt-auto flex flex-wrap gap-3 border-t border-line/70 pt-3 text-[11px] text-graphite">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{f._count.members} 人</span>
                  <span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" />{f._count.relationships} 条关系</span>
                  <span className="ml-auto">{formatDate(f.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </Card>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-line bg-white/50 px-4 py-3 text-[11px] leading-5 text-graphite">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        <span>同姓不代表同宗。平台不会依据姓氏自动合并家族或推定血缘关系；跨家族关联需要双方明确登记并注明依据。</span>
      </div>
    </div>
  );
}

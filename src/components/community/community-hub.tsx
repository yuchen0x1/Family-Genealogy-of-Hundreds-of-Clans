"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Plus, Users, MapPin, BookOpen, ShieldCheck, MessageSquare, Eye, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, Input } from "@/components/ui/primitives";
import { Pager, formatDate, parseError, Notice, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";

type PostItem = {
  id: string; title: string; content: string; type: string; typeLabel: string;
  tags: string[]; clues: Record<string, unknown>; visibility: string; status: string;
  viewCount: number; createdAt: string; familyId: string | null; familyName: string | null;
  surnameName: string | null; commentCount: number; canEdit: boolean;
  author: { id: string; displayName: string; surname: string | null; location: string | null };
};

type PageData = { items: PostItem[]; total: number; page: number; pageSize: number; totalPages: number };

const TABS = [
  { key: "", label: "全部" },
  { key: "SEEK_RELATIVE", label: "寻亲大厅" },
  { key: "DISCUSSION", label: "家族讨论" },
  { key: "FAMILY_NEWS", label: "家族动态" },
  { key: "ANNOUNCEMENT", label: "公告" },
  { key: "EVENT", label: "活动" },
  { key: "CORRECTION", label: "资料纠错" },
];

const TYPE_TONE: Record<string, "red" | "gold" | "jade" | "navy" | "neutral"> = {
  SEEK_RELATIVE: "red", DISCUSSION: "navy", FAMILY_NEWS: "jade",
  ANNOUNCEMENT: "gold", EVENT: "jade", CORRECTION: "neutral",
};

function VisibilityTag({ value }: { value: string }) {
  if (value === "PUBLIC") return <span className="inline-flex items-center gap-1 text-[11px] text-graphite"><Eye className="h-3 w-3" />公开</span>;
  if (value === "FAMILY") return <span className="inline-flex items-center gap-1 text-[11px] text-graphite"><Users className="h-3 w-3" />家族可见</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] text-graphite"><Lock className="h-3 w-3" />仅自己</span>;
}

function ClueSummary({ clues }: { clues: Record<string, unknown> }) {
  const entries = Object.entries(clues ?? {}).filter(([, v]) => v !== null && v !== "" && v !== undefined).slice(0, 3);
  if (!entries.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded border border-line bg-cream px-2 py-1 text-[11px] text-graphite">
          {k === "ancestralHome" ? "祖籍" : k === "generationPoem" ? "字辈" : k === "surname" ? "姓氏" : k}：{String(v)}
        </span>
      ))}
    </div>
  );
}

export function CommunityHub() {
  const [type, setType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [surname, setSurname] = useState("");
  const [searched, setSearched] = useState("");
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const loggedIn = Boolean(me?.authenticated);

  const url = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "12" });
    if (type) p.set("type", type);
    if (query) p.set("q", query);
    if (mine) p.set("mine", "1");
    return `/api/posts?${p.toString()}`;
  }, [type, query, page, mine]);
  const { data, isLoading, error, mutate } = useSWR<PageData>(url, fetcher);

  const clanUrl = searched ? `/api/clan/search?surname=${encodeURIComponent(searched)}` : null;
  const { data: clanResult } = useSWR<{ items: Array<{ id: string; displayName: string; surname: string | null; location: string | null; bio: string | null }>; total: number; notice: string }>(clanUrl, fetcher);
  const { data: connections, mutate: refreshConnections } = useSWR<Array<{
    id: string; status: string; direction: string; requesterName: string; addresseeName: string;
    canRespond: boolean; canRevoke: boolean; evidenceNote: string | null; createdAt: string;
  }>>(loggedIn ? "/api/clan-connections" : null, fetcher);

  async function handleConnection(id: string, action: "ACCEPT" | "REJECT" | "REVOKE") {
    try {
      const result = await apiRequest<{ notice: string }>(`/api/clan-connections/${id}`, { method: "PATCH", body: { action } });
      setNotice({ kind: "success", title: "关联申请已处理", lines: [result.notice] });
      await refreshConnections();
    } catch (err) { setNotice(parseError(err)); }
  }

  const goPage = (n: number) => { setPage(n); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setType(t.key); setPage(1); }}
              className={`rounded-md border px-3 py-1.5 text-[12px] transition-colors ${type === t.key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-soft hover:border-gold hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(keyword.trim()); setPage(1); }}>
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索寻亲线索、讨论内容或标签" aria-label="搜索帖子" />
            <Button type="submit" size="sm" variant="outline"><Search className="h-4 w-4" />搜索</Button>
          </form>
          {loggedIn && (
            <label className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-soft">
              <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} className="accent-navy" />
              只看我的
            </label>
          )}
          <Link href={loggedIn ? "/community/new" : "/login?next=/community/new"}>
            <Button size="sm" variant="gold"><Plus className="h-4 w-4" />发布内容</Button>
          </Link>
        </div>

        {notice && <div className="mb-4"><Notice data={notice} onClose={() => setNotice(null)} /></div>}

        {error && <div className="mb-4"><ErrorState description="社区内容加载失败，请检查网络后重试。" onRetry={() => mutate()} /></div>}
        {!error && isLoading && <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-8 text-sm text-graphite"><Loader2 className="h-4 w-4 animate-spin" />正在读取社区内容…</div>}
        {!error && !isLoading && data?.items.length === 0 && (
          <EmptyState
            title="暂无内容"
            description={query ? "没有匹配的公开内容。私人或家族可见的帖子不会出现在检索结果中。" : "这个分类下还没有内容，可以发布第一条寻亲或讨论信息。"}
            action={loggedIn ? <Link href="/community/new"><Button size="sm" variant="outline">发布内容</Button></Link> : undefined}
          />
        )}

        <div className="space-y-3">
          {data?.items.map((p) => (
            <Link key={p.id} href={`/community/${p.id}`} className="block">
              <Card className="card-hover transition-all hover:border-gold/60">
                <CardBody className="p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONE[p.type] ?? "neutral"}>{p.typeLabel}</Badge>
                    {p.surnameName && <span className="text-[11px] text-graphite">{p.surnameName}姓</span>}
                    <VisibilityTag value={p.visibility} />
                    {p.status !== "PUBLISHED" && <Badge tone="neutral">{p.status === "DRAFT" ? "草稿" : "已下架"}</Badge>}
                  </div>
                  <h3 className="font-serif text-[17px] font-semibold text-ink">{p.title}</h3>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-ink-soft">{p.content}</p>
                  {p.type === "SEEK_RELATIVE" && <ClueSummary clues={p.clues} />}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-graphite">
                    <span>{p.author.displayName}</span>
                    <span>{formatDate(p.createdAt)}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.commentCount} 条评论</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{p.viewCount}</span>
                    {p.tags?.slice(0, 3).map((t) => <span key={t} className="rounded bg-cream px-1.5 py-0.5">#{t}</span>)}
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        {data && data.totalPages > 1 && (
          <div className="mt-5"><Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={goPage} /></div>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Users className="h-4 w-4 text-gold" />同姓宗亲检索</h2></CardHeader>
          <CardBody>
            <p className="mb-3 text-[11px] leading-5 text-graphite">仅显示主动开启「允许宗亲检索」的用户；同姓不代表同宗，平台不据此认定血缘。</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearched(surname.trim()); }}>
              <Input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="输入姓氏，如：陈" aria-label="姓氏" />
              <Button type="submit" size="sm" variant="outline">检索</Button>
            </form>
            {!loggedIn && <p className="mt-2 text-[11px] text-graphite"><Link href="/login" className="text-gold underline">登录</Link>后可查看宗亲检索结果。</p>}
            {clanResult && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] text-graphite">找到 {clanResult.total} 位允许被检索的宗亲</div>
                {clanResult.items.length === 0 && <p className="text-[12px] text-graphite">暂无结果。可到「个人中心 → 隐私设置」开启被检索权限。</p>}
                {clanResult.items.map((u) => (
                  <div key={u.id} className="rounded-lg border border-line bg-cream/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink">{u.displayName}</span>
                      <Link href={`/me/messages?with=${u.id}`} className="text-[11px] text-gold hover:underline">发私信</Link>
                    </div>
                    {u.location && <div className="mt-1 flex items-center gap-1 text-[11px] text-graphite"><MapPin className="h-3 w-3" />{u.location}</div>}
                    {u.bio && <div className="mt-1 line-clamp-2 text-[11px] text-graphite">{u.bio}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {loggedIn && (
          <Card>
            <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-gold" />分支关联申请</h2></CardHeader>
            <CardBody>
              <p className="mb-3 text-[11px] leading-5 text-graphite">关联须双方确认并附依据；确认后不自动创建任何亲属关系。</p>
              {(connections ?? []).length === 0 && <p className="text-[12px] text-graphite">暂无关联申请。可在私信沟通后由对方发起。</p>}
              <div className="space-y-2">
                {(connections ?? []).slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-ink">{c.direction === "OUTGOING" ? `致 ${c.addresseeName}` : `来自 ${c.requesterName}`}</span>
                      <Badge tone={c.status === "ACCEPTED" ? "jade" : c.status === "PENDING" ? "gold" : "neutral"}>
                        {c.status === "PENDING" ? "待确认" : c.status === "ACCEPTED" ? "双方已确认" : c.status === "REJECTED" ? "已拒绝" : "已撤回"}
                      </Badge>
                    </div>
                    {c.evidenceNote && <p className="mt-1 line-clamp-2 text-[11px] text-graphite">依据：{c.evidenceNote}</p>}
                    {c.canRespond && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleConnection(c.id, "ACCEPT")}>确认关联</Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleConnection(c.id, "REJECT")}>拒绝</Button>
                      </div>
                    )}
                    {c.canRevoke && <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => void handleConnection(c.id, "REVOKE")}>撤回申请</Button></div>}
                  </div>
                ))}
              </div>
              <Link href="/me?tab=connections" className="mt-3 inline-block text-[11px] text-gold hover:underline">查看全部申请 →</Link>
            </CardBody>
          </Card>
        )}

        <Card className="ink-bg border-navy">
          <CardBody>
            <div className="text-[10px] tracking-[0.2em] text-gold/80">PRINCIPLES</div>
            <h2 className="mt-1 font-serif text-base font-semibold text-white">社区原则</h2>
            <div className="gold-rule mt-2" />
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-white/75">
              <li>· 同姓不等于同宗，任何关联都需双方确认与证据核验。</li>
              <li>· 寻亲线索由用户自行发布，平台不核实血缘结论。</li>
              <li>· 在世人物与私有族谱默认不公开，检索不会泄露。</li>
              <li>· 史料纠错需附出处，审核前不作为定论展示。</li>
            </ul>
            <Link href="/guide#privacy" className="mt-3 inline-flex items-center gap-1 text-[11px] text-gold hover:underline"><BookOpen className="h-3 w-3" />查看隐私与授权说明</Link>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

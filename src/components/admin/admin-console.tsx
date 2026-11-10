"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  LayoutDashboard, Users, ShieldCheck, BookOpen, ScrollText, Settings2,
  Search, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Database, Server, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Input, Select, Textarea, EmptyState, ErrorState } from "@/components/ui/primitives";
import { Field, Modal, Notice, Pager, formatDate, parseError, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";
import { SystemUpdatePanel } from "@/components/admin/system-update-panel";
import { UpdateBanner, UpdateDot, useUpdateNotice } from "@/components/admin/update-notice";

type Tab = "overview" | "users" | "moderation" | "sources" | "audit" | "settings";
const ALL_TABS: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { key: "overview", label: "总览", icon: LayoutDashboard },
  { key: "users", label: "用户与角色", icon: Users, adminOnly: true },
  { key: "moderation", label: "内容与举报", icon: ShieldCheck },
  { key: "sources", label: "史料与姓氏审核", icon: BookOpen },
  { key: "audit", label: "审计日志", icon: ScrollText, adminOnly: true },
  { key: "settings", label: "系统设置", icon: Settings2, adminOnly: true },
];

type Page<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

function Loading() {
  return <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-8 text-sm text-graphite"><Loader2 className="h-4 w-4 animate-spin" />正在读取…</div>;
}

function StatusBadge({ value }: { value: string }) {
  const tone = ["APPROVED", "PUBLISHED", "ACTIVE", "RESOLVED", "COMPLETED"].includes(value) ? "jade"
    : ["PENDING", "OPEN", "IN_REVIEW", "DRAFT", "PENDING_REVIEW", "QUEUED"].includes(value) ? "gold"
      : ["REJECTED", "REMOVED", "HIDDEN", "SUSPENDED", "DISMISSED", "FAILED"].includes(value) ? "red" : "neutral";
  return <Badge tone={tone}>{value}</Badge>;
}

export function AdminConsole() {
  const { data: me, isLoading } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const [tab, setTab] = useState<Tab>("overview");
  // 更新提示只对管理员有意义，且必须在所有提前 return 之前调用（Hooks 顺序）
  const isAdmin = Boolean(me?.user?.isAdmin);
  const updateState = useUpdateNotice(isAdmin);
  if (isLoading) return <Loading />;
  if (!me?.authenticated) return <EmptyState title="请先登录" description="管理后台需要管理员账号。" action={<Link href="/login"><Button size="sm" variant="gold">前往登录</Button></Link>} />;
  const isReviewer = isAdmin || Boolean(me.user?.roles?.includes("moderator"));
  if (!isReviewer) return <EmptyState title="无权访问" description="此页面仅对管理员与内容审核人员开放。" action={<Link href="/"><Button size="sm" variant="outline">返回首页</Button></Link>} />;
  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);
  const hasUpdate = Boolean(updateState?.updateAvailable);

  return (
    <div className="space-y-4">
      {/* 有新版本时直接提示，不必等管理员自己点开「系统设置 → 系统更新」 */}
      <UpdateBanner state={updateState} onAction={() => setTab("settings")} actionLabel="查看更新" />
      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${tab === t.key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-soft hover:border-gold hover:text-ink"}`}>
                <Icon className="h-4 w-4" />{t.label}
                {t.key === "settings" && hasUpdate && <UpdateDot />}
              </button>
            );
          })}
          <div className="mt-2 hidden rounded-lg border border-gold/40 bg-[#fbf7ee] p-3 text-[11px] leading-5 text-graphite lg:block">
            <Lock className="mb-1 h-3.5 w-3.5 text-gold" />
            后台只处理元数据与审核状态；私有族谱的人物明细、加密敏感字段与档案正文不会在此展示。
          </div>
        </nav>

        <div className="min-w-0">
          {tab === "overview" && <OverviewPanel />}
          {tab === "users" && isAdmin && <UsersPanel />}
          {tab === "moderation" && <ModerationPanel />}
          {tab === "sources" && <SourcesPanel />}
          {tab === "audit" && isAdmin && <AuditPanel />}
          {tab === "settings" && isAdmin && <SettingsPanel />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 总览 ------------------------------ */
function OverviewPanel() {
  const { data, isLoading, error, mutate } = useSWR<{
    counts: Record<string, number>; pending: Record<string, number>;
    services: { database: string; cache: string; storageDriver: string; s3Configured: boolean; ocrConfigured: boolean; searchProvider: string };
    recentAudit: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
    notice: string;
  }>("/api/admin/overview", fetcher);
  if (error) return <ErrorState title="总览加载失败" description="后台概览接口暂时不可用，请重试或检查服务状态。" onRetry={() => mutate()} />;
  if (isLoading || !data) return <Loading />;
  const groups = [
    { title: "账号与族谱", items: [["注册用户", data.counts.users], ["活跃用户", data.counts.activeUsers], ["家族族谱", data.counts.families], ["公开族谱", data.counts.publicFamilies], ["族谱人物", data.counts.members], ["亲属关系", data.counts.relations]] },
    { title: "知识与史料", items: [["姓氏条目", data.counts.surnames], ["史料来源", data.counts.sources], ["历史地名", data.counts.places], ["迁徙记录", data.counts.migrations]] },
    { title: "社区与档案", items: [["帖子", data.counts.posts], ["已发布", data.counts.publishedPosts], ["评论", data.counts.comments], ["档案", data.counts.documents], ["审计日志", data.counts.auditLogs]] },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-ink">平台总览</h2>
        <Button size="sm" variant="outline" onClick={() => void mutate()}><RefreshCw className="h-3.5 w-3.5" />刷新</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data.pending.reports + data.pending.posts + data.pending.documents + data.pending.sources + data.pending.surnames) > 0 && (
          <Card className="border-gold/50 bg-[#fbf7ee]"><CardBody>
            <div className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><AlertTriangle className="h-4 w-4 text-gold" />待处理事项</div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-graphite">
              <span>举报：{data.pending.reports}</span><span>待审内容：{data.pending.posts}</span>
              <span>待审档案：{data.pending.documents}</span><span>待审史料：{data.pending.sources}</span>
              <span>待审姓氏：{data.pending.surnames}</span>
            </div>
          </CardBody></Card>
        )}
        <Card><CardBody>
          <div className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Server className="h-4 w-4 text-gold" />服务状态</div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-graphite">
            <span>数据库：{data.services.database === "connected" ? "已连接" : "异常"}</span>
            <span>缓存：{data.services.cache === "redis" ? "Redis" : "内存降级"}</span>
            <span>存储：{data.services.storageDriver}</span>
            <span>S3：{data.services.s3Configured ? "已配置" : "未接入"}</span>
            <span>OCR：{data.services.ocrConfigured ? "已配置" : "未接入"}</span>
            <span>搜索：{data.services.searchProvider}</span>
          </div>
        </CardBody></Card>
        <Card><CardBody>
          <div className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Database className="h-4 w-4 text-gold" />数据任务</div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-graphite">
            <span>导入任务：{data.counts.importJobs}</span><span>导出任务：{data.counts.exportJobs}</span>
            <span>公开族谱：{data.counts.publicFamilies}</span><span>私有族谱：{data.counts.families - data.counts.publicFamilies}</span>
          </div>
        </CardBody></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.title}><CardHeader><h3 className="font-serif text-sm font-semibold text-ink">{g.title}</h3></CardHeader>
            <CardBody className="grid grid-cols-2 gap-3">
              {g.items.map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-line bg-cream/50 p-2.5">
                  <div className="font-serif text-xl text-ink">{value}</div>
                  <div className="text-[11px] text-graphite">{label}</div>
                </div>
              ))}
            </CardBody></Card>
        ))}
      </div>

      <Card><CardHeader><h3 className="font-serif text-sm font-semibold text-ink">最近操作</h3></CardHeader>
        <CardBody className="space-y-1.5">
          {data.recentAudit.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 border-b border-line/70 py-1.5 text-[11px] last:border-0">
              <span className="font-mono text-ink-soft">{a.action}</span>
              <span className="text-graphite">{a.entityType} · {formatDate(a.createdAt)}</span>
            </div>
          ))}
          {data.recentAudit.length === 0 && <p className="text-[12px] text-graphite">暂无审计记录。</p>}
        </CardBody></Card>
      <p className="text-[11px] text-graphite">{data.notice}</p>
    </div>
  );
}

/* ------------------------------ 用户与角色 ------------------------------ */
type UserRow = {
  id: string; email: string; status: string; createdAt: string; lastLoginAt: string | null;
  profile: { displayName: string; surname: string | null } | null;
  roles: Array<{ role: { key: string; name: string } }>;
  _count: { ownedFamilies: number; posts: number; documents: number };
};
function UsersPanel() {
  const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const url = `/api/admin/users?page=${page}&pageSize=10${query ? `&q=${encodeURIComponent(query)}` : ""}${status ? `&status=${status}` : ""}`;
  const { data, isLoading, error, mutate } = useSWR<Page<UserRow>>(url, fetcher);

  async function patch(userId: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    try { await apiRequest("/api/admin/users", { method: "PATCH", body: { userId, ...body } }); setNotice({ kind: "success", title: success }); await mutate(); }
    catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      <div className="flex flex-wrap gap-2">
        <form className="flex min-w-[200px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按邮箱或昵称搜索" />
          <Button type="submit" size="sm" variant="outline"><Search className="h-3.5 w-3.5" />搜索</Button>
        </form>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">全部状态</option><option value="ACTIVE">正常</option><option value="SUSPENDED">已停权</option><option value="DEACTIVATED">已注销</option>
        </Select>
      </div>
      {error ? <ErrorState title="用户列表加载失败" onRetry={() => mutate()} /> : isLoading || !data ? <Loading /> : (
        <Card><CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="border-b border-line bg-cream/70 text-[11px] text-graphite"><tr>
                <th className="px-4 py-2.5">用户</th><th className="px-4 py-2.5">状态</th><th className="px-4 py-2.5">角色</th>
                <th className="px-4 py-2.5">族谱 / 帖子</th><th className="px-4 py-2.5">注册时间</th><th className="px-4 py-2.5">操作</th>
              </tr></thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5"><div className="font-medium text-ink">{u.profile?.displayName ?? "—"}</div><div className="text-[11px] text-graphite">{u.email}</div></td>
                    <td className="px-4 py-2.5"><StatusBadge value={u.status} /></td>
                    <td className="px-4 py-2.5">{u.roles.map((r) => <span key={r.role.key} className="mr-1 rounded bg-cream px-1.5 py-0.5 text-[10px] text-graphite">{r.role.name}</span>)}</td>
                    <td className="px-4 py-2.5 text-graphite">{u._count.ownedFamilies} / {u._count.posts}</td>
                    <td className="px-4 py-2.5 text-graphite">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setEdit(u); setRoleKeys(u.roles.map((r) => r.role.key)); }}>角色</Button>
                      {u.status === "ACTIVE"
                        ? <Button size="sm" variant="ghost" onClick={() => void patch(u.id, { status: "SUSPENDED" }, "账号已停权并撤销全部会话")}>停权</Button>
                        : <Button size="sm" variant="ghost" onClick={() => void patch(u.id, { status: "ACTIVE" }, "账号已恢复")}>恢复</Button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </CardBody></Card>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="调整用户角色" description="角色变更立即生效；不能移除自己的管理员权限。"
        footer={<><Button size="sm" variant="outline" onClick={() => setEdit(null)}>取消</Button>
          <Button size="sm" variant="gold" loading={busy} onClick={async () => { if (!edit) return; await patch(edit.id, { roleKeys }, "角色已更新"); setEdit(null); }}>保存</Button></>}>
        <div className="space-y-2">
          <p className="text-[12px] text-graphite">{edit?.profile?.displayName} · {edit?.email}</p>
          {["user", "editor", "moderator", "admin"].map((key) => (
            <label key={key} className="flex items-center gap-2 rounded border border-line p-2.5 text-[12px] text-ink">
              <input type="checkbox" className="accent-navy" checked={roleKeys.includes(key)}
                onChange={(e) => setRoleKeys(e.target.checked ? [...roleKeys, key] : roleKeys.filter((k) => k !== key))} />
              {key === "user" ? "普通用户" : key === "editor" ? "资料编辑" : key === "moderator" ? "内容审核" : "系统管理员"}
            </label>
          ))}
          <p className="text-[11px] text-graphite">管理员角色拥有平台全量管理权限，但后台接口仍不返回私有族谱的人物明细。</p>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ 内容与举报 ------------------------------ */
type PostRow = { id: string; title: string; type: string; status: string; visibility: string; createdAt: string; viewCount: number; author: { profile: { displayName: string } | null } | null; _count: { comments: number } };
type ReportRow = { id: string; targetType: string; targetId: string; reason: string; status: string; resolution: string | null; createdAt: string; reporter: { profile: { displayName: string } | null } | null };
function ModerationPanel() {
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [handling, setHandling] = useState<ReportRow | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState("RESOLVED");
  const { data: posts, mutate: refreshPosts } = useSWR<Page<PostRow>>("/api/admin/posts?pageSize=20", fetcher);
  const { data: reports, mutate: refreshReports } = useSWR<Page<ReportRow>>("/api/admin/reports?pageSize=20", fetcher);

  async function moderate(id: string, status: string) {
    setBusy(true);
    try { await apiRequest("/api/admin/posts", { method: "PATCH", body: { id, status, reason: "后台审核操作" } }); await refreshPosts(); setNotice({ kind: "success", title: "内容状态已更新" }); }
    catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }
  async function handleReport() {
    if (!handling) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ notice: string }>("/api/admin/reports", {
        method: "PATCH", body: { id: handling.id, status: resolutionStatus, resolution },
      });
      setHandling(null); setResolution("");
      await refreshReports();
      setNotice({ kind: "success", title: "举报已处理", lines: [result.notice] });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      <section>
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">举报与纠错（{reports?.total ?? 0}）</h3>
        {!reports ? <Loading /> : (
          <Card><CardBody className="space-y-2">
            {reports.items.length === 0 && <p className="py-4 text-center text-[12px] text-graphite">暂无举报。</p>}
            {reports.items.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-ink">{r.targetType} · {r.reporter?.profile?.displayName ?? "用户"}</span>
                  <StatusBadge value={r.status} />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-soft">{r.reason}</p>
                {r.resolution && <p className="mt-1 text-[11px] text-graphite">处理结论：{r.resolution}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-graphite">{formatDate(r.createdAt)}</span>
                  <Button size="sm" variant="outline" onClick={() => { setHandling(r); setResolution(""); setResolutionStatus("RESOLVED"); }}>处理</Button>
                </div>
              </div>
            ))}
          </CardBody></Card>
        )}
      </section>
      <section>
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">帖子内容（{posts?.total ?? 0}）</h3>
        {!posts ? <Loading /> : (
          <Card><CardBody className="p-0"><div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="border-b border-line bg-cream/70 text-[11px] text-graphite"><tr>
                <th className="px-4 py-2.5">标题</th><th className="px-4 py-2.5">类型</th><th className="px-4 py-2.5">可见性</th><th className="px-4 py-2.5">状态</th><th className="px-4 py-2.5">操作</th>
              </tr></thead>
              <tbody>{posts.items.map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2.5"><Link href={`/community/${p.id}`} className="text-ink hover:text-gold">{p.title}</Link><div className="text-[11px] text-graphite">{p.author?.profile?.displayName ?? "—"} · {formatDate(p.createdAt)}</div></td>
                  <td className="px-4 py-2.5 text-graphite">{p.type}</td>
                  <td className="px-4 py-2.5 text-graphite">{p.visibility}</td>
                  <td className="px-4 py-2.5"><StatusBadge value={p.status} /></td>
                  <td className="px-4 py-2.5"><div className="flex gap-1">
                    {p.status !== "PUBLISHED" && <Button size="sm" variant="outline" loading={busy} onClick={() => void moderate(p.id, "PUBLISHED")}>恢复发布</Button>}
                    {p.status === "PUBLISHED" && <Button size="sm" variant="ghost" loading={busy} onClick={() => void moderate(p.id, "HIDDEN")}>下架</Button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div></CardBody></Card>
        )}
      </section>
      <Modal open={Boolean(handling)} onClose={() => setHandling(null)} title="处理举报" description="处理只记录状态与结论，不自动删除内容或改写史料。"
        footer={<><Button size="sm" variant="outline" onClick={() => setHandling(null)}>取消</Button><Button size="sm" variant="gold" loading={busy} onClick={() => void handleReport()}>保存处理结果</Button></>}>
        <div className="space-y-3">
          <p className="text-[12px] text-ink-soft">{handling?.reason}</p>
          <Field label="处理状态"><Select value={resolutionStatus} onChange={(e) => setResolutionStatus(e.target.value)}>
            <option value="IN_REVIEW">处理中</option><option value="RESOLVED">已处理</option><option value="DISMISSED">不予处理</option>
          </Select></Field>
          <Field label="处理说明 *" hint="至少 4 个字，会记录到审计日志"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="说明核查依据与结论" /></Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ 史料与姓氏审核 ------------------------------ */
type SourceRow = { id: string; title: string; author: string | null; edition: string | null; publisher: string | null; publishYear: number | null; volumeOrPage: string | null; originalQuote: string | null; digitalUrl: string | null; credibility: string; reviewStatus: string; notes: string | null; _count: { citations: number } };
type SurnameRow = { id: string; name: string; pinyin: string; originSummary: string | null; credibility: string; reviewStatus: string; viewCount: number; _count: { origins: number; figures: number; migrations: number } };
function SourcesPanel() {
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: sources, mutate: refreshSources } = useSWR<Page<SourceRow>>("/api/admin/sources?pageSize=20", fetcher);
  const { data: surnames, mutate: refreshSurnames } = useSWR<Page<SurnameRow>>("/api/admin/surnames?pageSize=20", fetcher);

  async function update(kind: "sources" | "surnames", id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiRequest(`/api/admin/${kind}`, { method: "PATCH", body: { id, ...body } });
      await (kind === "sources" ? refreshSources() : refreshSurnames());
      setNotice({ kind: "success", title: "审核状态已更新" });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      <Card className="border-gold/40 bg-[#fbf7ee]"><CardBody className="text-[11px] leading-6 text-graphite">
        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-gold" />
        审核纪律：不得改写原文引用，不得凭空补充卷次页码或史料内容；缺少可核验收据的条目保持待审核。传说标 TRADITION，推断标 INFERRED，未核实标 UNVERIFIED。
      </CardBody></Card>
      <section>
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">史料来源（{sources?.total ?? 0}）</h3>
        {!sources ? <Loading /> : <Card><CardBody className="space-y-2">
          {sources.items.map((s) => (
            <div key={s.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-serif text-[13px] font-semibold text-ink">{s.title}</span>
                <StatusBadge value={s.reviewStatus} />
              </div>
              <div className="mt-1 text-[11px] text-graphite">
                {[s.author, s.edition, s.publisher, s.publishYear ? `${s.publishYear} 年` : null, s.volumeOrPage].filter(Boolean).join(" · ") || "暂无版本信息"}
              </div>
              {s.originalQuote && <p className="mt-1.5 line-clamp-2 text-[11px] text-ink-soft">原文：{s.originalQuote}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{s.credibility}</Badge>
                <span className="text-[11px] text-graphite">引用 {s._count.citations} 处</span>
                <div className="ml-auto flex gap-1">
                  {s.reviewStatus !== "APPROVED" && <Button size="sm" variant="outline" loading={busy} onClick={() => void update("sources", s.id, { reviewStatus: "APPROVED" })}>审定</Button>}
                  {s.reviewStatus !== "PENDING" && <Button size="sm" variant="ghost" loading={busy} onClick={() => void update("sources", s.id, { reviewStatus: "PENDING" })}>退回待审</Button>}
                </div>
              </div>
            </div>
          ))}
        </CardBody></Card>}
      </section>
      <section>
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">姓氏资料（{surnames?.total ?? 0}）</h3>
        {!surnames ? <Loading /> : <Card><CardBody className="space-y-2">
          {surnames.items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Link href={`/surnames/${encodeURIComponent(s.name)}`} className="font-serif text-[14px] font-semibold text-ink hover:text-gold">{s.name}</Link><span className="text-[11px] text-graphite">{s.pinyin}</span></div>
                <div className="mt-1 line-clamp-1 text-[11px] text-graphite">{s.originSummary ?? "暂无起源摘要"}</div>
                <div className="mt-1 flex gap-2 text-[11px] text-graphite"><Badge tone="neutral">{s.credibility}</Badge><span>起源 {s._count.origins} · 人物 {s._count.figures} · 迁徙 {s._count.migrations}</span></div>
              </div>
              <div className="flex items-center gap-2"><StatusBadge value={s.reviewStatus} />
                {s.reviewStatus !== "APPROVED" && <Button size="sm" variant="outline" loading={busy} onClick={() => void update("surnames", s.id, { reviewStatus: "APPROVED" })}>审定</Button>}
                {s.reviewStatus !== "PENDING" && <Button size="sm" variant="ghost" loading={busy} onClick={() => void update("surnames", s.id, { reviewStatus: "PENDING" })}>退回待审</Button>}
              </div>
            </div>
          ))}
        </CardBody></Card>}
      </section>
    </div>
  );
}

/* ------------------------------ 审计日志 ------------------------------ */
type AuditRow = { id: string; actorId: string | null; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; ipHash: string | null; userAgent: string | null; createdAt: string; actor: { profile: { displayName: string } | null } | null };
function AuditPanel() {
  const [q, setQ] = useState(""); const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const url = `/api/admin/audit-logs?page=${page}&pageSize=20${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const { data, isLoading, error, mutate } = useSWR<Page<AuditRow> & { notice: string }>(url, fetcher);
  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按动作或实体类型搜索，如 family.import" />
        <Button type="submit" size="sm" variant="outline"><Search className="h-3.5 w-3.5" />搜索</Button>
      </form>
      {error ? <ErrorState title="审计日志加载失败" onRetry={() => mutate()} /> : isLoading || !data ? <Loading /> : <Card><CardBody className="space-y-1.5">
        {data.items.map((a) => (
          <div key={a.id} className="rounded-lg border border-line p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[12px] text-ink">{a.action}</span>
              <div className="flex items-center gap-2 text-[11px] text-graphite">
                <span>{a.actor?.profile?.displayName ?? "系统/匿名"}</span><span>{formatDate(a.createdAt)}</span>
                <button type="button" className="text-gold hover:underline" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>{expanded === a.id ? "收起" : "详情"}</button>
              </div>
            </div>
            <div className="mt-1 text-[11px] text-graphite">{a.entityType}{a.entityId ? ` · ${a.entityId}` : ""} · IP {a.ipHash ? "已脱敏" : "—"}</div>
            {expanded === a.id && (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-cream p-2 text-[10px] leading-4 text-ink-soft">{JSON.stringify({ before: a.before, after: a.after, userAgent: a.userAgent }, null, 2)}</pre>
            )}
          </div>
        ))}
        {data.items.length === 0 && <p className="py-6 text-center text-[12px] text-graphite">暂无日志。</p>}
        <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      </CardBody></Card>}
      <p className="text-[11px] text-graphite">{data?.notice}</p>
    </div>
  );
}

/* ------------------------------ 系统设置 ------------------------------ */
type SettingRow = { key: string; value: { value?: unknown }; description: string | null; updatedBy: string | null; updatedAt: string; editable: boolean };
function SettingsPanel() {
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, mutate } = useSWR<{ items: SettingRow[]; readOnlyKeys: string[]; notice: string }>("/api/admin/settings", fetcher);

  async function save() {
    if (!editing) return;
    let value: string | boolean | number = draft;
    if (typeof editing.value?.value === "boolean") value = draft === "true";
    else if (typeof editing.value?.value === "number") value = Number(draft);
    setBusy(true);
    try {
      await apiRequest("/api/admin/settings", { method: "PATCH", body: { key: editing.key, value } });
      setEditing(null); await mutate();
      setNotice({ kind: "success", title: "系统设置已更新" });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {/* 系统更新放在设置页首位：版本状态是运维最需要一眼看到的信息 */}
      <SystemUpdatePanel />
      {!data ? <Loading /> : <>
        <Card className="border-gold/40 bg-[#fbf7ee]"><CardBody className="text-[11px] leading-6 text-graphite">{data.notice}</CardBody></Card>
        <Card><CardBody className="space-y-2">
          {data.items.map((s) => (
            <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-ink">{s.key}</div>
                <div className="mt-0.5 text-[11px] text-graphite">{s.description ?? "—"}</div>
                <div className="mt-1 text-[11px] text-ink-soft">当前值：{JSON.stringify(s.value?.value ?? null)}</div>
              </div>
              <div className="flex items-center gap-2">
                {!s.editable && <Badge tone="neutral">只读</Badge>}
                {s.editable && <Button size="sm" variant="outline" onClick={() => { setEditing(s); setDraft(String(s.value?.value ?? "")); }}>修改</Button>}
              </div>
            </div>
          ))}
        </CardBody></Card>
      </>}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="修改系统设置" description={editing?.description ?? undefined}
        footer={<><Button size="sm" variant="outline" onClick={() => setEditing(null)}>取消</Button><Button size="sm" variant="gold" loading={busy} onClick={() => void save()}>保存</Button></>}>
        <Field label={editing?.key ?? ""} hint="仅白名单内的设置项可修改，值会按原类型校验">
          {typeof editing?.value?.value === "boolean" ? (
            <Select value={draft} onChange={(e) => setDraft(e.target.value)}><option value="true">true</option><option value="false">false</option></Select>
          ) : editing?.key === "search.provider" ? (
            <Select value={draft} onChange={(e) => setDraft(e.target.value)}><option value="postgres_pgtrgm">PostgreSQL pg_trgm</option><option value="meilisearch">Meilisearch（需另行接入）</option><option value="opensearch">OpenSearch（需另行接入）</option></Select>
          ) : <Input value={draft} onChange={(e) => setDraft(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  UserCog, ShieldCheck, Bell, Users, Database, KeyRound, Monitor,
  Download, Trash2, MessageSquare, LogOut, Check, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, Input, Textarea, EmptyState } from "@/components/ui/primitives";
import { Field, Modal, Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";
import { UpdateBanner, useUpdateNotice } from "@/components/admin/update-notice";

type Tab = "profile" | "security" | "notices" | "connections" | "data";

const TABS: Array<{ key: Tab; label: string; icon: typeof UserCog }> = [
  { key: "profile", label: "资料与隐私", icon: UserCog },
  { key: "security", label: "安全与会话", icon: ShieldCheck },
  { key: "notices", label: "消息与通知", icon: Bell },
  { key: "connections", label: "关联申请", icon: Users },
  { key: "data", label: "数据管理", icon: Database },
];

type Profile = {
  id: string; displayName: string; bio: string | null; surname: string | null;
  location: string | null; privacySettings: Record<string, unknown> | null;
};
type Session = { id: string; userAgent: string | null; createdAt: string; expiresAt: string; revokedAt: string | null; current: boolean; active: boolean };
type NotificationItem = { id: string; type: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string };
type Connection = {
  id: string; status: string; direction: string; requesterName: string; addresseeName: string;
  canRespond: boolean; canRevoke: boolean; evidenceNote: string | null;
  requesterConfirmedAt: string | null; addresseeConfirmedAt: string | null; createdAt: string;
};

const PRIVACY_ITEMS = [
  { key: "allowClanSearch", name: "允许同姓宗亲检索到我", desc: "关闭后，你的昵称不会出现在宗亲检索结果中；变更立即生效。" },
  { key: "showSurname", name: "在社区展示我的姓氏", desc: "默认关闭；开启后帖子与评论会附带姓氏。" },
  { key: "showLocation", name: "展示所在地区", desc: "默认关闭；地区信息由你自己填写，平台不做地理定位。" },
  { key: "showEmail", name: "向其他用户展示邮箱", desc: "强烈建议保持关闭；当前接口无论如何都不会返回邮箱。" },
];

export function MeCenter({ initialTab }: { initialTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab as Tab : "profile");
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: me, mutate: refreshMe } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const { data: profile, mutate: refreshProfile } = useSWR<Profile>("/api/me/profile", fetcher);
  const { data: sessions, mutate: refreshSessions } = useSWR<Session[]>("/api/me/sessions", fetcher);
  const { data: noticeData, mutate: refreshNotices } = useSWR<{ items: NotificationItem[]; unread: number; total: number }>("/api/notifications?pageSize=20", fetcher);
  const { data: connections, mutate: refreshConnections } = useSWR<Connection[]>("/api/clan-connections", fetcher);
  // 登录后落在个人中心，管理员在这里就能看到「有新版本」而不是必须去后台翻
  const updateState = useUpdateNotice(Boolean(me?.user?.isAdmin));

  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirm: "" });

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: {} });
      await refreshMe();
      router.push("/");
    } catch (err) { setNotice(parseError(err)); }
  }

  /** 用非受控表单 + key 重挂载，避免把服务端数据同步进 effect 触发 setState 规则。 */
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? "").trim();
    setBusy(true);
    try {
      await apiRequest("/api/me/profile", {
        method: "PATCH",
        body: {
          displayName: text("displayName"),
          bio: text("bio") || null, surname: text("surname") || null, location: text("location") || null,
          privacySettings: {
            allowClanSearch: fd.get("allowClanSearch") === "on",
            showSurname: fd.get("showSurname") === "on",
            showLocation: fd.get("showLocation") === "on",
            showEmail: fd.get("showEmail") === "on",
          },
        },
      });
      await Promise.all([refreshProfile(), refreshMe()]);
      setNotice({ kind: "success", title: "资料与隐私设置已保存" });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.newPassword !== password.confirm) { setNotice({ kind: "error", title: "两次输入的新密码不一致" }); return; }
    setBusy(true);
    try {
      const result = await apiRequest<{ notice: string }>("/api/me/password", {
        method: "POST", body: { currentPassword: password.currentPassword, newPassword: password.newPassword },
      });
      setPassword({ currentPassword: "", newPassword: "", confirm: "" });
      setNotice({ kind: "success", title: "密码已更新", lines: [result.notice] });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  async function revoke(id?: string) {
    try {
      const result = await apiRequest<{ notice: string }>(`/api/me/sessions${id ? `?id=${id}` : "?all=1"}`, { method: "DELETE" });
      setNotice({ kind: "success", title: "会话已撤销", lines: [result.notice] });
      await refreshSessions();
      if (!id) router.push("/login");
    } catch (err) { setNotice(parseError(err)); }
  }

  async function markRead(all = false) {
    try {
      const result = await apiRequest<{ updated: number }>("/api/notifications", { method: "PATCH", body: all ? { all: true } : { ids: (noticeData?.items ?? []).filter((n) => !n.readAt).map((n) => n.id) } });
      setNotice({ kind: "success", title: `已标记 ${result.updated} 条通知为已读` });
      await refreshNotices();
    } catch (err) { setNotice(parseError(err)); }
  }

  async function handleConnection(id: string, action: "ACCEPT" | "REJECT" | "REVOKE") {
    try {
      const result = await apiRequest<{ notice: string }>(`/api/clan-connections/${id}`, { method: "PATCH", body: { action } });
      setNotice({ kind: "success", title: "关联申请已处理", lines: [result.notice] });
      await refreshConnections();
    } catch (err) { setNotice(parseError(err)); }
  }

  async function deleteAccount() {
    if (deleteForm.confirm !== "DELETE_MY_ACCOUNT") {
      setNotice({ kind: "error", title: "请输入 DELETE_MY_ACCOUNT 以确认注销" }); return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ summary: Record<string, number>; notice: string }>("/api/me/delete", {
        method: "POST", body: { password: deleteForm.password, confirm: deleteForm.confirm },
      });
      setDeleteOpen(false);
      setNotice({ kind: "success", title: "账号已注销", lines: [result.notice, `处理项：${Object.entries(result.summary).map(([k, v]) => `${k} ${v}`).join("、")}`] });
      setTimeout(() => router.push("/"), 1500);
    } catch (err) { setNotice(parseError(err)); setBusy(false); }
  }

  if (me && !me.authenticated) {
    return <EmptyState title="请先登录" description="个人中心需要登录后才能查看。" action={<Link href="/login"><Button size="sm" variant="gold">前往登录</Button></Link>} />;
  }

  const unread = noticeData?.unread ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${tab === t.key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-soft hover:border-gold hover:text-ink"}`}>
              <Icon className="h-4 w-4" />{t.label}
              {t.key === "notices" && unread > 0 && <span className="ml-auto rounded-full bg-cinnabar px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
            </button>
          );
        })}
        <Button size="sm" variant="ghost" className="hidden w-full justify-start lg:inline-flex" onClick={() => void logout()}><LogOut className="h-4 w-4" />退出登录</Button>
      </nav>

      <div className="min-w-0 space-y-4">
        <UpdateBanner state={updateState} href="/admin" actionLabel="前往后台更新" />
        {notice && <Notice data={notice} onClose={() => setNotice(null)} />}

        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-serif text-lg font-semibold text-ink">{me?.user?.displayName ?? "…"}</div>
              <div className="mt-1 text-[12px] text-graphite">{me?.user?.email}</div>
            </div>
            <div className="flex flex-wrap gap-4 text-center text-[11px] text-graphite">
              <div><div className="font-serif text-xl text-ink">{me?.user?.stats.familyCount ?? 0}</div>创建的族谱</div>
              <div><div className="font-serif text-xl text-ink">{me?.user?.stats.collaboratorCount ?? 0}</div>协作的族谱</div>
              <div><div className="font-serif text-xl text-ink">{me?.user?.stats.documentCount ?? 0}</div>上传的档案</div>
            </div>
          </CardBody>
        </Card>

        {tab === "profile" && (
          <form key={`profile-${profile?.id ?? "loading"}-${JSON.stringify(profile?.privacySettings ?? {})}`} onSubmit={(e) => void saveProfile(e)} className="space-y-4">
            <Card>
              <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">基本资料</h2></CardHeader>
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="昵称 *"><Input name="displayName" defaultValue={profile?.displayName ?? ""} required maxLength={100} /></Field>
                <Field label="姓氏" hint="仅用于宗亲检索与社区展示，需单独授权"><Input name="surname" defaultValue={profile?.surname ?? ""} maxLength={20} placeholder="如：陈" /></Field>
                <Field label="所在地区"><Input name="location" defaultValue={profile?.location ?? ""} maxLength={200} placeholder="如：河南许昌" /></Field>
                <Field label="个人简介"><Textarea name="bio" rows={2} defaultValue={profile?.bio ?? ""} maxLength={1000} placeholder="可选" /></Field>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">隐私与授权</h2></CardHeader>
              <CardBody className="space-y-3">
                {PRIVACY_ITEMS.map((item) => (
                  <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:border-gold/60">
                    <input type="checkbox" name={item.key} className="mt-0.5 accent-navy"
                      defaultChecked={(profile?.privacySettings as Record<string, unknown> | null)?.[item.key] === true} />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{item.name}</span>
                      <span className="mt-0.5 block text-[11px] leading-5 text-graphite">{item.desc}</span>
                    </span>
                  </label>
                ))}
                <p className="text-[11px] leading-5 text-graphite">授权可随时撤回，撤回后立即生效；撤回不影响已发生的合法数据处理记录。</p>
              </CardBody>
            </Card>
            <Button type="submit" variant="gold" loading={busy}><Check className="h-4 w-4" />保存资料与隐私设置</Button>
          </form>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><KeyRound className="h-4 w-4 text-gold" />修改密码</h2></CardHeader>
              <CardBody>
                <form onSubmit={(e) => void changePassword(e)} className="grid gap-4 sm:grid-cols-3">
                  <Field label="当前密码"><Input type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required /></Field>
                  <Field label="新密码" hint="至少 8 位，含字母与数字"><Input type="password" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} required /></Field>
                  <Field label="确认新密码"><Input type="password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} required /></Field>
                  <div className="sm:col-span-3"><Button type="submit" variant="gold" size="sm" loading={busy}>更新密码</Button></div>
                </form>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Monitor className="h-4 w-4 text-gold" />登录设备</h2><Button size="sm" variant="outline" onClick={() => void revoke()}>撤销全部会话</Button></div></CardHeader>
              <CardBody className="space-y-2">
                {(sessions ?? []).length === 0 && <p className="text-[12px] text-graphite">正在读取…</p>}
                {sessions?.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink">
                        {s.current && <Badge tone="jade">当前设备</Badge>}
                        {!s.active && <Badge tone="neutral">已失效</Badge>}
                        <span className="truncate">{s.userAgent ?? "未知设备"}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-graphite">登录 {formatDate(s.createdAt)} · 到期 {formatDate(s.expiresAt)}</div>
                    </div>
                    {s.active && !s.current && <Button size="sm" variant="ghost" onClick={() => void revoke(s.id)}>撤销</Button>}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        )}

        {tab === "notices" && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Bell className="h-4 w-4 text-gold" />站内通知（未读 {unread}）</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void markRead(false)}>标记本页已读</Button>
                  <Button size="sm" variant="ghost" onClick={() => void markRead(true)}>全部已读</Button>
                  <Link href="/me/messages"><Button size="sm" variant="outline"><MessageSquare className="h-3.5 w-3.5" />私信</Button></Link>
                </div>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {(noticeData?.items ?? []).length === 0 && <p className="py-6 text-center text-[12px] text-graphite">暂无通知。</p>}
              {noticeData?.items.map((n) => (
                <div key={n.id} className={`rounded-lg border p-3 ${n.readAt ? "border-line bg-white" : "border-gold/40 bg-[#fbf7ee]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">{notificationLabel(n.type)}</span>
                    <span className="text-[11px] text-graphite">{formatDate(n.createdAt)}</span>
                  </div>
                  {typeof n.payload?.notice === "string" && <p className="mt-1 text-[11px] text-graphite">{String(n.payload.notice)}</p>}
                  {typeof n.payload?.title === "string" && <p className="mt-1 text-[11px] text-ink-soft">相关内容：{String(n.payload.title)}</p>}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {tab === "connections" && (
          <Card>
            <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">分支关联申请</h2></CardHeader>
            <CardBody className="space-y-3">
              <p className="text-[11px] leading-5 text-graphite">同姓不代表同宗。申请须双方确认并附证据说明；确认后平台不会自动创建或推断任何亲属关系。</p>
              {(connections ?? []).length === 0 && <p className="py-5 text-center text-[12px] text-graphite">暂无关联申请。</p>}
              {connections?.map((c) => (
                <div key={c.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{c.direction === "OUTGOING" ? `致 ${c.addresseeName}` : `来自 ${c.requesterName}`}</span>
                    <Badge tone={c.status === "ACCEPTED" ? "jade" : c.status === "PENDING" ? "gold" : "neutral"}>
                      {c.status === "PENDING" ? "待对方确认" : c.status === "ACCEPTED" ? "双方已确认" : c.status === "REJECTED" ? "已拒绝" : "已撤回"}
                    </Badge>
                  </div>
                  {c.evidenceNote && <p className="mt-2 text-[11px] text-graphite">依据：{c.evidenceNote}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-graphite">
                    <span>发起方确认：{c.requesterConfirmedAt ? formatDate(c.requesterConfirmedAt) : "—"}</span>
                    <span>对方确认：{c.addresseeConfirmedAt ? formatDate(c.addresseeConfirmedAt) : "—"}</span>
                  </div>
                  {(c.canRespond || c.canRevoke) && (
                    <div className="mt-3 flex gap-2">
                      {c.canRespond && <><Button size="sm" variant="gold" onClick={() => void handleConnection(c.id, "ACCEPT")}>确认关联</Button><Button size="sm" variant="ghost" onClick={() => void handleConnection(c.id, "REJECT")}>拒绝</Button></>}
                      {c.canRevoke && <Button size="sm" variant="ghost" onClick={() => void handleConnection(c.id, "REVOKE")}>撤回申请</Button>}
                    </div>
                  )}
                </div>
              ))}
              <Link href="/community" className="inline-block text-[11px] text-gold hover:underline">前往社区寻找宗亲 →</Link>
            </CardBody>
          </Card>
        )}

        {tab === "data" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><Database className="h-4 w-4 text-gold" />我的数据</h2></CardHeader>
              <CardBody>
                <p className="mb-3 text-[12px] leading-6 text-graphite">导出本人账号信息、资料、发布的帖子与评论、通知、举报与操作记录。族谱人物明细、他人私信与加密敏感字段不在导出范围内。</p>
                <a href="/api/me/export" download className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:border-gold"><Download className="h-4 w-4" />导出个人数据（JSON）</a>
              </CardBody>
            </Card>
            <Card className="border-cinnabar/30">
              <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-cinnabar"><Trash2 className="h-4 w-4" />账号注销与信息删除</h2></CardHeader>
              <CardBody>
                <ul className="mb-4 space-y-1.5 text-[12px] leading-6 text-graphite">
                  <li>· 邮箱脱敏、密码置为不可登录、资料清空、隐私授权全部撤回、全部会话下线。</li>
                  <li>· 本人公开帖子转为私有并下架，评论内容清空，私信与通知、搜索记录删除。</li>
                  <li>· 仅本人参与的私有族谱一并软删除；有协作者的族谱保留，避免删除他人共同录入的资料。</li>
                  <li>· 操作不可逆，需输入密码并显式确认；关键步骤保留审计记录（不含个人身份信息）。</li>
                </ul>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>注销账号并删除个人信息</Button>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3 text-[12px] text-graphite">
                <Settings2 className="h-4 w-4 text-gold" />
                <Link href="/legal/privacy" className="text-gold hover:underline">隐私政策</Link>
                <Link href="/legal/terms" className="text-gold hover:underline">用户协议</Link>
                <Link href="/guide#privacy" className="text-gold hover:underline">授权与撤回说明</Link>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="确认注销账号" description="此操作不可逆，请再次确认已了解数据处理范围。"
        footer={<><Button size="sm" variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button size="sm" variant="danger" loading={busy} onClick={() => void deleteAccount()}>确认注销</Button></>}>
        <div className="space-y-4">
          <Field label="当前密码"><Input type="password" value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })} /></Field>
          <Field label="输入 DELETE_MY_ACCOUNT 确认" hint="需完全一致，用于防止误操作">
            <Input value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} placeholder="DELETE_MY_ACCOUNT" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function notificationLabel(type: string) {
  const map: Record<string, string> = {
    "post.commented": "有人评论了你的内容",
    "message.received": "收到新的私信",
    "clan.connection.request": "收到分支关联申请",
    "clan.connection.accept": "关联申请已被确认",
    "clan.connection.reject": "关联申请被拒绝",
    "clan.connection.revoke": "关联申请已撤回",
  };
  return map[type] ?? type;
}

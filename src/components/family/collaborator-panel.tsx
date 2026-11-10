"use client";

import { useState } from "react";
import useSWR from "swr";
import { UserPlus, Copy, Trash2, ShieldCheck, Mail, Lock } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Select } from "@/components/ui/primitives";
import { Field, Modal, Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";

type Collaborator = {
  id: string; userId: string; permission: string; status: string;
  acceptedAt: string | null; createdAt: string;
  user: { id: string; email: string; profile: { displayName: string } | null };
};
type Invitation = {
  id: string; email: string; permission: string; expiresAt: string; createdAt: string;
};

const PERMISSION_LABELS: Record<string, string> = {
  OWNER: "所有者", ADMIN: "管理员", EDITOR: "编辑者", VIEWER: "浏览者",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "已加入", PENDING: "待接受", REVOKED: "已撤销", DECLINED: "已拒绝",
};

export function CollaboratorPanel({ familyId, canManage, isOwner }: {
  familyId: string; canManage: boolean; isOwner: boolean;
}) {
  const { data, isLoading, mutate } = useSWR<{ collaborators: Collaborator[]; invitations: Invitation[]; restricted?: boolean }>(
    `/api/families/${familyId}/collaborators`, fetcher,
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: "", permission: "VIEWER" });
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNotice(null); setInviteUrl("");
    try {
      const r = await apiRequest<{ invitationUrl: string; expiresAt: string }>(`/api/families/${familyId}/collaborators`, {
        method: "POST", body: { email: form.email.trim(), permission: form.permission },
      });
      setInviteUrl(r.invitationUrl);
      setNotice({ kind: "success", title: "邀请已生成", lines: [`链接有效期至 ${formatDate(r.expiresAt)}；仅保存 token 摘要，需被邀请人用同一邮箱登录后在 7 天内接受。`] });
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const changePermission = async (c: Collaborator, permission: string) => {
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/collaborators/${c.userId}`, { method: "PATCH", body: { permission } });
      setNotice({ kind: "success", title: `已将 ${c.user.profile?.displayName || c.user.email} 的权限改为${PERMISSION_LABELS[permission]}` });
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const revoke = async (c: Collaborator) => {
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/collaborators/${c.userId}`, { method: "DELETE" });
      setNotice({ kind: "success", title: "已撤销该协作者权限" });
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setNotice({ kind: "success", title: "邀请链接已复制到剪贴板" }); }
    catch { setNotice({ kind: "warning", title: "复制失败，请手动选中链接复制" }); }
  };

  if (data?.restricted) {
    return <Notice data={{ kind: "warning", title: "协作名单仅对家族协作者开放", lines: ["为保护成员邮箱等个人信息，公开族谱的非协作者访客无法查看协作名单。"] }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">家族协作</h2>
          <p className="mt-1 text-xs text-graphite">邀请链接只保存摘要，受邀人须使用同一邮箱登录后才可加入；所有者权限受保护。</p>
        </div>
        {canManage && <Button size="sm" variant="gold" onClick={() => { setNotice(null); setInviteUrl(""); setInviteOpen(true); }}><UserPlus className="h-3.5 w-3.5" />邀请协作者</Button>}
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(PERMISSION_LABELS).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-white px-3 py-2.5 text-[11px] leading-5 text-graphite">
            <div className="font-medium text-ink">{v}</div>
            <div>{k === "OWNER" ? "创建者，可恢复版本、删除族谱" : k === "ADMIN" ? "可邀请成员、修改族谱设置" : k === "EDITOR" ? "可录入人物、关系与字辈" : "只读浏览，含私有内容"}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">协作者（{data?.collaborators.length ?? 0}）</h3></CardHeader>
        <CardBody className="p-0">
          {isLoading && <div className="skeleton m-4 h-24 rounded-lg" />}
          {data && data.collaborators.length === 0 && <div className="p-4"><EmptyState title="暂无协作者" description="邀请家人共同维护族谱。" /></div>}
          {data && data.collaborators.length > 0 && (
            <ul className="divide-y divide-line/70">
              {data.collaborators.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{c.user.profile?.displayName || "未设置昵称"}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-graphite"><Mail className="h-3 w-3" />{c.user.email}</div>
                  </div>
                  <Badge tone={c.status === "ACTIVE" ? "jade" : "gold"}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                  {canManage && c.permission !== "OWNER" ? (
                    <Select value={c.permission} disabled={busy} onChange={(e) => void changePermission(c, e.target.value)} className="h-8 w-28 text-xs">
                      {Object.entries(PERMISSION_LABELS).filter(([k]) => k !== "OWNER").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  ) : <Badge tone="navy">{PERMISSION_LABELS[c.permission] ?? c.permission}</Badge>}
                  {canManage && c.permission !== "OWNER" && <Button size="icon" variant="ghost" title="撤销权限" disabled={busy} onClick={() => void revoke(c)}><Trash2 className="h-3.5 w-3.5 text-cinnabar" /></Button>}
                  {c.permission === "OWNER" && <span title="所有者权限受保护"><Lock className="h-3.5 w-3.5 text-gold" /></span>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canManage && data && data.invitations.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">待接受的邀请（{data.invitations.length}）</h3></CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line/70">
              {data.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                  <span className="text-ink">{i.email}</span>
                  <Badge tone="neutral">{PERMISSION_LABELS[i.permission] ?? i.permission}</Badge>
                  <span className="ml-auto text-[11px] text-graphite">有效期至 {formatDate(i.expiresAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-line bg-white/60 px-4 py-3 text-[11px] leading-5 text-graphite">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
        协作邀请不会自动授予血缘关系，也不会把两个同姓家族合并。{isOwner ? "作为所有者，你可以恢复历史版本或删除整份族谱。" : "只有所有者可以恢复历史版本或删除族谱。"}
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="邀请家族协作者"
        description="邀请链接在 7 天内有效；被邀请人必须使用与邀请邮箱一致的账号登录并主动接受。"
        footer={<><Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>关闭</Button><Button variant="gold" size="sm" type="submit" form="invite-form" loading={busy}>生成邀请</Button></>}>
        <form id="invite-form" onSubmit={invite} className="space-y-3">
          <Field label="受邀人邮箱 *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" required /></Field>
          <Field label="授予权限"><Select value={form.permission} onChange={(e) => setForm({ ...form, permission: e.target.value })}><option value="VIEWER">浏览者（只读）</option><option value="EDITOR">编辑者</option><option value="ADMIN">管理员</option></Select></Field>
          {inviteUrl && <div className="rounded-lg border border-[#c6dedb] bg-[#eef6f4] p-3">
            <div className="mb-1.5 text-[11px] font-medium text-[#2f5a58]">邀请链接（请通过安全渠道发送）</div>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="h-8 text-[11px]" onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="outline" onClick={() => void copy()}><Copy className="h-3.5 w-3.5" />复制</Button>
            </div>
          </div>}
        </form>
      </Modal>
    </div>
  );
}

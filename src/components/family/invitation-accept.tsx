"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Mail, ShieldCheck, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { apiRequest, fetcher, type MeResponse } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Notice, formatDate } from "@/components/family/shared";

type Invitation = {
  family: { id: string; name: string; surnameText: string; visibility: string };
  email: string; permission: string; expiresAt: string;
};

const PERMISSION_LABELS: Record<string, string> = { OWNER: "所有者", ADMIN: "管理员", EDITOR: "编辑者", VIEWER: "浏览者" };

export function InvitationAccept({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<Invitation>(`/api/invitations/${encodeURIComponent(token)}`, fetcher);
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST" });
      setDone(true);
    } catch (err) { setNotice(err instanceof Error ? err.message : "接受邀请失败"); }
    finally { setBusy(false); }
  };

  if (isLoading || meLoading) return <div className="skeleton h-64 rounded-xl" />;
  if (error || !data) {
    return <Card><CardBody><EmptyState title="邀请无效或已过期" description="邀请链接可能已被使用、撤销或超过 7 天有效期。请联系家族所有者重新生成。" action={<Link href="/families"><Button size="sm" variant="outline">返回族谱中心</Button></Link>} /></CardBody></Card>;
  }

  const emailMismatch = me?.authenticated && me.user?.email.toLowerCase() !== data.email.toLowerCase();

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <div className="text-xs tracking-[0.25em] text-gold">FAMILY INVITATION</div>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink">家族协作邀请</h1>
          <p className="mt-2 text-xs leading-6 text-graphite">你被邀请参与维护一份家族族谱。接受后，你将获得该族谱对应权限，可查看私有内容（编辑权限视授予级别而定）。</p>
        </div>

        <div className="rounded-lg border border-line bg-cream/50 p-4 text-xs leading-6">
          <div className="flex flex-wrap items-center gap-2"><span className="font-serif text-lg text-ink">{data.family.name}</span><Badge tone="navy">{data.family.surnameText}姓</Badge></div>
          <div className="mt-2 flex flex-wrap gap-4 text-graphite">
            <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />受邀邮箱：{data.email}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />权限：{PERMISSION_LABELS[data.permission] ?? data.permission}</span>
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />有效期至 {formatDate(data.expiresAt)}</span>
          </div>
        </div>

        {notice && <Notice data={{ kind: "error", title: notice }} />}

        {done ? (
          <div className="rounded-lg border border-[#c6dedb] bg-[#eef6f4] p-4 text-xs leading-6 text-[#2f5a58]">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />邀请已接受</div>
            <p className="mt-2">你现在可以访问该族谱。若授予的是浏览者权限，则只能查看；编辑与管理员权限由家族所有者调整。</p>
            <Link href={`/families/${data.family.id}`} className="mt-3 inline-block"><Button size="sm" variant="gold">进入族谱</Button></Link>
          </div>
        ) : !me?.authenticated ? (
          <div className="space-y-3">
            <Notice data={{ kind: "warning", title: "需要先登录才能接受邀请", lines: ["请使用与受邀邮箱一致的账号登录；系统会在接受时校验邮箱，防止邀请链接被他人冒用。"] }} />
            <div className="flex flex-wrap gap-2">
              <Link href={`/login?next=${encodeURIComponent(`/invitations/${token}`)}`}><Button size="sm">前往登录</Button></Link>
              <Link href="/register"><Button size="sm" variant="outline">注册账号</Button></Link>
            </div>
          </div>
        ) : emailMismatch ? (
          <Notice data={{ kind: "error", title: "当前账号邮箱与邀请邮箱不一致", lines: [`当前登录：${me.user?.email}`, `邀请邮箱：${data.email}`, "请退出后使用受邀邮箱对应的账号登录，或联系家族所有者重新发送邀请。"] }} />
        ) : (
          <div className="space-y-3">
            <Notice data={{ kind: "warning", title: "隐私与授权提示", lines: ["接受后你将能访问该族谱的私有人物资料；请仅在确认邀请来源可信时接受。", "协作权限可随时由所有者撤销，接受邀请不会产生任何血缘关系推定。"] }} />
            <div className="flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />系统仅保存邀请 token 的摘要，不保存明文链接。</div>
            <Button variant="gold" loading={busy} onClick={() => void accept()}>接受邀请并加入族谱</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

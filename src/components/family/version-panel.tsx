"use client";

import { useState } from "react";
import useSWR from "swr";
import { History, Save, RotateCcw, AlertTriangle, ShieldCheck } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input } from "@/components/ui/primitives";
import { Field, Modal, Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";

type Version = {
  id: string; versionNumber: number; label: string | null;
  changeSummary: string | null; checksum: string; createdAt: string; createdById: string | null;
};
type RestoreResult = {
  restoredVersion: number; backupVersion: number;
  membersRestored: number; relationshipsRestored: number;
};

export function VersionPanel({ familyId, canWrite, isOwner, onChanged }: {
  familyId: string; canWrite: boolean; isOwner: boolean; onChanged?: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<Version[]>(`/api/families/${familyId}/versions`, fetcher);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoring, setRestoring] = useState<Version | null>(null);
  const [backupForm, setBackupForm] = useState({ label: "", changeSummary: "" });
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const backup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/versions`, {
        method: "POST",
        body: { label: backupForm.label.trim() || "手动备份", changeSummary: backupForm.changeSummary.trim() || undefined },
      });
      setNotice({ kind: "success", title: "版本快照已创建" });
      setBackupOpen(false);
      setBackupForm({ label: "", changeSummary: "" });
      await mutate();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const restore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoring) return;
    if (confirmText !== "RESTORE") { setNotice({ kind: "error", title: "请输入 RESTORE 以确认恢复操作" }); return; }
    setBusy(true); setNotice(null);
    try {
      const r = await apiRequest<RestoreResult>(`/api/families/${familyId}/versions/${restoring.id}/restore`, {
        method: "POST", body: { confirm: "RESTORE" },
      });
      setResult(r);
      setRestoring(null);
      setConfirmText("");
      setNotice({ kind: "success", title: `已恢复到版本 ${r.restoredVersion}`, lines: [`恢复前已自动创建备份版本 ${r.backupVersion}，可再次恢复以撤销本次操作。`, `本次恢复 ${r.membersRestored} 位人物、${r.relationshipsRestored} 条关系。`] });
      await mutate();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">版本与恢复</h2>
          <p className="mt-1 text-xs text-graphite">每次人物、关系变更都会自动生成快照；恢复仅覆盖人物与关系，字辈、分支与档案有独立版本机制。</p>
        </div>
        {canWrite && <Button size="sm" variant="gold" onClick={() => { setNotice(null); setBackupOpen(true); }}><Save className="h-3.5 w-3.5" />创建备份</Button>}
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {result && <Notice data={{ kind: "success", title: `恢复完成：版本 ${result.restoredVersion}`, lines: [`恢复前备份：版本 ${result.backupVersion}`, `人物 ${result.membersRestored} 位 / 关系 ${result.relationshipsRestored} 条`] }} onClose={() => setResult(null)} />}

      {!isOwner && <Notice data={{ kind: "warning", title: "恢复操作仅限家族所有者", lines: ["你可以查看版本历史与创建备份，但只有 OWNER 能执行恢复。"] }} />}

      <Card>
        <CardHeader><h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><History className="h-4 w-4 text-gold" />版本历史（最近 50 条）</h3></CardHeader>
        <CardBody className="p-0">
          {isLoading && <div className="skeleton m-4 h-24 rounded-lg" />}
          {data && data.length === 0 && <div className="p-4"><EmptyState title="暂无版本快照" description="添加人物或登记关系后会自动生成。" /></div>}
          {data && data.length > 0 && (
            <ul className="divide-y divide-line/70">
              {data.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs">
                  <Badge tone="navy">v{v.versionNumber}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{v.label || "未命名快照"}</div>
                    {v.changeSummary && <div className="mt-0.5 text-[11px] text-graphite">{v.changeSummary}</div>}
                    <div className="mt-0.5 text-[10px] text-graphite">{formatDate(v.createdAt)} · 校验值 {v.checksum.slice(0, 12)}…</div>
                  </div>
                  {isOwner && <Button size="sm" variant="outline" onClick={() => { setNotice(null); setResult(null); setRestoring(v); }}><RotateCcw className="h-3 w-3" />恢复</Button>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-line bg-white/60 px-4 py-3 text-[11px] leading-5 text-graphite">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
        版本快照不会包含人物敏感资料（联系方式、详细住址等加密字段）。恢复前系统会自动再创建一次备份，保证恢复本身可撤销。
      </div>

      <Modal open={backupOpen} onClose={() => setBackupOpen(false)} title="创建版本备份"
        footer={<><Button variant="outline" size="sm" onClick={() => setBackupOpen(false)}>取消</Button><Button variant="gold" size="sm" type="submit" form="backup-form" loading={busy}>创建快照</Button></>}>
        <form id="backup-form" onSubmit={backup} className="space-y-3">
          <Field label="快照名称"><Input value={backupForm.label} onChange={(e) => setBackupForm({ ...backupForm, label: e.target.value })} placeholder="例如：录入二房支系前" maxLength={200} /></Field>
          <Field label="变更说明"><Input value={backupForm.changeSummary} onChange={(e) => setBackupForm({ ...backupForm, changeSummary: e.target.value })} maxLength={1000} /></Field>
        </form>
      </Modal>

      <Modal open={Boolean(restoring)} onClose={() => setRestoring(null)} title="确认恢复版本"
        description="此操作会用所选快照覆盖当前人物与关系（软删除当前数据后重建），请谨慎执行。"
        footer={<><Button variant="outline" size="sm" onClick={() => setRestoring(null)}>取消</Button><Button variant="danger" size="sm" type="submit" form="restore-form" loading={busy}>确认恢复</Button></>}>
        {restoring && <form id="restore-form" onSubmit={restore} className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-[#edcdc7] bg-[#fbeeeb] px-3 py-2.5 text-xs leading-5 text-[#93382c]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>即将恢复到 <strong>v{restoring.versionNumber} · {restoring.label || "未命名快照"}</strong>。恢复前会自动创建当前状态的备份版本，因此该操作可撤销。</span>
          </div>
          <Field label="请输入 RESTORE 以确认" hint="区分大小写，用于防止误操作。">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" autoComplete="off" />
          </Field>
        </form>}
      </Modal>
    </div>
  );
}

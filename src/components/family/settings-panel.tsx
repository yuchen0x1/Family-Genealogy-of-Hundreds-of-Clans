"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, AlertTriangle, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Input, Select, Textarea, Badge } from "@/components/ui/primitives";
import { Field, Modal, Notice, parseError, VISIBILITY_LABELS, type NoticeData } from "@/components/family/shared";

export type FamilyDetail = {
  id: string; name: string; surnameText: string; founderName: string | null;
  ancestralHome: string | null; hallName: string | null; description: string | null;
  visibility: string; isDemo: boolean; createdAt: string; updatedAt: string;
  access: { level: string | null; isOwner: boolean };
  _count: { members: number; relationships: number; documents: number };
};

export function SettingsPanel({ family, onChanged }: { family: FamilyDetail; onChanged?: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: family.name, surnameText: family.surnameText,
    founderName: family.founderName ?? "", ancestralHome: family.ancestralHome ?? "",
    hallName: family.hallName ?? "", description: family.description ?? "",
    visibility: family.visibility,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const canWrite = ["OWNER", "ADMIN", "EDITOR"].includes(family.access.level ?? "");
  const isOwner = family.access.isOwner;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${family.id}`, {
        method: "PATCH",
        body: {
          name: form.name.trim(), surnameText: form.surnameText.trim(),
          founderName: form.founderName.trim() || null,
          ancestralHome: form.ancestralHome.trim() || null,
          hallName: form.hallName.trim() || null,
          description: form.description.trim() || null,
          visibility: form.visibility,
        },
      });
      setNotice({ kind: "success", title: "家族资料已更新" });
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText !== "DELETE") { setNotice({ kind: "error", title: "请输入 DELETE 以确认" }); return; }
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${family.id}`, { method: "DELETE" });
      router.push("/families?mine=1");
      router.refresh();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink">族谱设置</h2>
        <p className="mt-1 text-xs text-graphite">管理基本信息、公开范围与数据处理。删除为软删除，不会物理抹除历史数据。</p>
      </div>
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">基本信息</h3></CardHeader>
          <CardBody>
            <form id="family-settings-form" onSubmit={save} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="家族名称 *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={!canWrite} required maxLength={200} /></Field>
                <Field label="姓氏 *"><Input value={form.surnameText} onChange={(e) => set("surnameText", e.target.value)} disabled={!canWrite} required maxLength={20} /></Field>
                <Field label="始祖 / 始迁祖"><Input value={form.founderName} onChange={(e) => set("founderName", e.target.value)} disabled={!canWrite} maxLength={100} /></Field>
                <Field label="堂号"><Input value={form.hallName} onChange={(e) => set("hallName", e.target.value)} disabled={!canWrite} maxLength={100} /></Field>
              </div>
              <Field label="祖籍地"><Input value={form.ancestralHome} onChange={(e) => set("ancestralHome", e.target.value)} disabled={!canWrite} maxLength={300} /></Field>
              <Field label="家族简介"><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} disabled={!canWrite} maxLength={10000} /></Field>
              <Field label="可见范围" hint={form.visibility !== "PUBLIC" ? "私有 / 家族可见的族谱不会出现在公开列表与全站搜索结果中。" : "公开后族谱名称与主动公开的人物会进入搜索；在世人物仍默认严格保护。"}>
                <Select value={form.visibility} onChange={(e) => set("visibility", e.target.value)} disabled={!canWrite}>
                  {Object.entries(VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              {canWrite && <Button type="submit" variant="gold" size="sm" loading={busy}><Save className="h-3.5 w-3.5" />保存修改</Button>}
            </form>
          </CardBody>
        </Card>

        <aside className="space-y-4">
          <Card><CardBody>
            <h3 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-jade" />当前状态</h3>
            <div className="space-y-2 text-[11px] leading-5 text-graphite">
              <div className="flex items-center justify-between"><span>权限</span><Badge tone="navy">{family.access.level ?? "公开访客"}</Badge></div>
              <div className="flex items-center justify-between"><span>可见范围</span><Badge tone={family.visibility === "PUBLIC" ? "gold" : "neutral"}>{VISIBILITY_LABELS[family.visibility]}</Badge></div>
              <div className="flex items-center justify-between"><span>人物 / 关系</span><span>{family._count.members} / {family._count.relationships}</span></div>
              <div className="flex items-center justify-between"><span>关联档案</span><span>{family._count.documents}</span></div>
              <div className="flex items-center justify-between"><span>创建时间</span><span>{new Date(family.createdAt).toLocaleDateString("zh-CN")}</span></div>
              {family.isDemo && <Badge tone="red">演示数据 · 非真实家族</Badge>}
            </div>
          </CardBody></Card>

          {isOwner && (
            <Card className="border-[#edcdc7]"><CardBody>
              <h3 className="mb-2 font-serif text-sm font-semibold text-cinnabar">危险操作</h3>
              <p className="mb-3 text-[11px] leading-5 text-graphite">删除族谱后将从所有列表与搜索中移除，数据以软删除形式保留，可由管理员在后台恢复。</p>
              <Button size="sm" variant="danger" onClick={() => { setNotice(null); setConfirmText(""); setConfirmOpen(true); }}><Trash2 className="h-3.5 w-3.5" />删除族谱</Button>
            </CardBody></Card>
          )}
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="确认删除族谱"
        description="该操作会把整份族谱标记为已删除；人物、关系、版本快照仍保留在数据库中。"
        footer={<><Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>取消</Button><Button variant="danger" size="sm" type="submit" form="delete-family-form" loading={busy}>确认删除</Button></>}>
        <form id="delete-family-form" onSubmit={remove} className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-[#edcdc7] bg-[#fbeeeb] px-3 py-2.5 text-xs leading-5 text-[#93382c]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>即将删除：<strong>{family.name}</strong>。删除后无法从前台访问，如需恢复请联系管理员。</span></div>
          <Field label="请输入 DELETE 以确认"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoComplete="off" /></Field>
        </form>
      </Modal>
    </div>
  );
}

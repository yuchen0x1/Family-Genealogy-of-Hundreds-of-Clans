"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Trash2, ShieldCheck, Info, Search, ArrowRight } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  Field, Modal, Notice, Pager, parseError, RELATION_LABELS, SUBTYPE_LABELS,
  VERIFICATION_LABELS, EVIDENCE_LABELS, type NoticeData,
} from "@/components/family/shared";

type PersonOption = { id: string; name: string; gender: string; isLiving: boolean };
type RelationRow = {
  id: string; type: string; subtype: string; verification: string; evidenceLevel: string;
  startDateText: string | null; endDateText: string | null; marriageOrder: number | null;
  notes: string | null; directional: boolean; createdAt: string;
  fromPerson: { id: string; surnameText: string; givenName: string };
  toPerson: { id: string; surnameText: string; givenName: string };
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

const EMPTY = {
  fromPersonId: "", toPersonId: "", type: "PARENT_CHILD", subtype: "BIOLOGICAL",
  verification: "UNVERIFIED", evidenceLevel: "UNVERIFIED",
  startDateText: "", endDateText: "", marriageOrder: "", notes: "",
};
type FormState = typeof EMPTY;

const DIRECTION_HINT: Record<string, string> = {
  PARENT_CHILD: "方向：左侧人物为父/母，右侧人物为子女。生物学父母最多两位，写入前会做冲突检测。",
  SPOUSE: "婚姻关系为双向关系，重复登记或反向写法会被识别；多次婚姻请填写婚姻次序。",
  SIBLING: "兄弟姐妹关系需与已登记的父母信息一致，系统不会仅凭姓氏自动推断。",
  ADOPTION: "方向：左侧为养父母，右侧为养子女；收养不等同于生物学血缘。",
  SUCCESSION: "过继 / 继承关系需注明依据，不自动改变生物学亲子关系。",
  GUARDIANSHIP: "监护关系不构成血缘结论。",
  CROSS_FAMILY_LINK: "跨家族关联只是标记，不会自动合并两个家族或推定血缘。",
};

export function RelationPanel({ familyId, canWrite, onChanged }: {
  familyId: string; canWrite: boolean; onChanged?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RelationRow | null>(null);
  const [deleting, setDeleting] = useState<RelationRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editForm, setEditForm] = useState({ verification: "UNVERIFIED", evidenceLevel: "UNVERIFIED", notes: "", startDateText: "", endDateText: "", marriageOrder: "" });
  const [memberQuery, setMemberQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);

  const url = `/api/families/${familyId}/relationships?page=${page}${typeFilter ? `&type=${typeFilter}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<Paged<RelationRow>>(url, fetcher, { keepPreviousData: true });
  const { data: peopleData } = useSWR<Paged<PersonOption>>(
    canWrite && (creating || editing) ? `/api/families/${familyId}/members?pageSize=100&keyword=${encodeURIComponent(memberQuery)}` : null,
    fetcher,
  );
  const people = peopleData?.items ?? [];
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setForm(EMPTY); setNotice(null); setCreating(true); };
  const openEdit = (r: RelationRow) => {
    setEditForm({
      verification: r.verification, evidenceLevel: r.evidenceLevel, notes: r.notes ?? "",
      startDateText: r.startDateText ?? "", endDateText: r.endDateText ?? "",
      marriageOrder: r.marriageOrder == null ? "" : String(r.marriageOrder),
    });
    setNotice(null);
    setEditing(r);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNotice(null);
    try {
      if (!form.fromPersonId || !form.toPersonId) throw new Error("请选择关系的双方人物");
      if (form.fromPersonId === form.toPersonId) throw new Error("不能建立人物与自身的关系");
      const result = await apiRequest<{ relation: RelationRow; warnings: string[] }>(`/api/families/${familyId}/relationships`, {
        method: "POST",
        body: {
          fromPersonId: form.fromPersonId,
          toPersonId: form.toPersonId,
          type: form.type,
          subtype: form.subtype,
          verification: form.verification,
          evidenceLevel: form.evidenceLevel,
          startDateText: form.startDateText.trim() || null,
          endDateText: form.endDateText.trim() || null,
          marriageOrder: form.marriageOrder.trim() ? Number(form.marriageOrder) : null,
          notes: form.notes.trim() || null,
        },
      });
      setNotice({
        kind: result.warnings?.length ? "warning" : "success",
        title: result.warnings?.length ? "关系已登记，但需要留意以下提示" : "关系已登记，已生成版本快照",
        lines: result.warnings ?? [],
      });
      setCreating(false);
      await mutate();
      onChanged?.();
    } catch (err) {
      setNotice(parseError(err));
    } finally { setBusy(false); }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/relationships/${editing.id}`, {
        method: "PATCH",
        body: {
          verification: editForm.verification,
          evidenceLevel: editForm.evidenceLevel,
          notes: editForm.notes.trim() || null,
          startDateText: editForm.startDateText.trim() || null,
          endDateText: editForm.endDateText.trim() || null,
          marriageOrder: editForm.marriageOrder.trim() ? Number(editForm.marriageOrder) : null,
        },
      });
      setEditing(null);
      setNotice({ kind: "success", title: "关系资料已更新。标记为已核实前系统会重新执行冲突检测。" });
      await mutate();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/relationships/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setNotice({ kind: "success", title: "关系已移除（软删除），版本快照已生成。" });
      await mutate();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const quickVerify = async (r: RelationRow) => {
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/relationships/${r.id}`, { method: "PATCH", body: { verification: "VERIFIED" } });
      setNotice({ kind: "success", title: "已标记为核实通过，该关系现在参与亲属称谓计算。" });
      await mutate();
      onChanged?.();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const nameOf = (p: { surnameText: string; givenName: string }) => `${p.surnameText}${p.givenName}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">关系管理</h2>
          <p className="mt-1 text-xs text-graphite">仅「已核实」的关系参与亲属称谓与祖先追溯；写入前自动检查血缘环、重复与父母数量冲突。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 w-36 text-xs">
            <option value="">全部类型</option>
            {Object.entries(RELATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {canWrite && <Button size="sm" variant="gold" onClick={openCreate}><Plus className="h-3.5 w-3.5" />登记关系</Button>}
        </div>
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {error && <Notice data={{ kind: "error", title: error instanceof Error ? error.message : "关系列表加载失败" }} />}

      {isLoading && !data && <div className="skeleton h-48 rounded-xl" />}
      {!isLoading && data && data.items.length === 0 && (
        <EmptyState title={typeFilter ? "该类型暂无关系记录" : "尚未登记任何亲属关系"} description="登记父母子女、配偶、收养等关系后，图谱与亲属称谓计算才能工作。" action={canWrite ? <Button size="sm" variant="gold" onClick={openCreate}><Plus className="h-3.5 w-3.5" />登记关系</Button> : undefined} />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-cream/80 text-[11px] text-graphite">
                <tr><th className="px-4 py-2.5 font-medium">关系链</th><th className="px-4 py-2.5 font-medium">类型 / 子类型</th><th className="px-4 py-2.5 font-medium">核实状态</th><th className="px-4 py-2.5 font-medium">依据 / 时间</th><th className="px-4 py-2.5 text-right font-medium">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-cream/40">
                    <td className="px-4 py-2.5"><span className="font-medium text-ink">{nameOf(r.fromPerson)}</span><ArrowRight className="mx-1.5 inline h-3 w-3 text-gold" /><span className="font-medium text-ink">{nameOf(r.toPerson)}</span></td>
                    <td className="px-4 py-2.5"><Badge tone="navy">{RELATION_LABELS[r.type] ?? r.type}</Badge>
                      <span className="ml-1.5 text-graphite">{SUBTYPE_LABELS[r.subtype] ?? r.subtype}</span>
                      {r.marriageOrder ? <span className="ml-1.5 text-graphite">第 {r.marriageOrder} 次婚姻</span> : null}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={r.verification === "VERIFIED" ? "jade" : r.verification === "DISPUTED" ? "red" : "gold"}>{VERIFICATION_LABELS[r.verification] ?? r.verification}</Badge></td>
                    <td className="px-4 py-2.5 text-[11px] text-graphite">{EVIDENCE_LABELS[r.evidenceLevel] ?? r.evidenceLevel}{r.startDateText ? ` · ${r.startDateText}` : ""}{r.notes ? <div className="mt-0.5 max-w-[180px] truncate" title={r.notes}>{r.notes}</div> : null}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end gap-1">
                      {canWrite && r.verification !== "VERIFIED" && <Button size="icon" variant="ghost" title="标记为已核实" onClick={() => void quickVerify(r)} disabled={busy}><ShieldCheck className="h-3.5 w-3.5 text-jade" /></Button>}
                      {canWrite && <Button size="icon" variant="ghost" title="编辑" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canWrite && <Button size="icon" variant="ghost" title="删除" onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5 text-cinnabar" /></Button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </Card>
      )}

      {/* 登记关系 */}
      <Modal open={creating} onClose={() => setCreating(false)} wide title="登记亲属关系"
        description="关系必须明确方向与类型；系统会执行冲突检测，未通过时不会写入。"
        footer={<><Button variant="outline" size="sm" onClick={() => setCreating(false)}>取消</Button><Button variant="gold" size="sm" type="submit" form="relation-form" loading={busy}>提交并校验</Button></>}>
        <form id="relation-form" onSubmit={submitCreate} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
            <Input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="按名字筛选人物（最多显示 100 人）" className="h-9 pl-8 text-xs" />
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="关系起点人物 *"><Select value={form.fromPersonId} onChange={(e) => set("fromPersonId", e.target.value)} required><option value="">请选择…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isLiving ? "（在世）" : ""}</option>)}</Select></Field>
            <div className="pb-2 text-center text-xs text-gold">→</div>
            <Field label="关系终点人物 *"><Select value={form.toPersonId} onChange={(e) => set("toPersonId", e.target.value)} required><option value="">请选择…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isLiving ? "（在世）" : ""}</option>)}</Select></Field>
          </div>
          <Notice data={{ kind: "warning", title: "方向说明", lines: [DIRECTION_HINT[form.type]] }} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="关系类型"><Select value={form.type} onChange={(e) => set("type", e.target.value)}>{Object.entries(RELATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="关系子类型"><Select value={form.subtype} onChange={(e) => set("subtype", e.target.value)}>{Object.entries(SUBTYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="核实状态" hint="只有「已核实」会进入称谓计算"><Select value={form.verification} onChange={(e) => set("verification", e.target.value)}>{Object.entries(VERIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="依据可信程度"><Select value={form.evidenceLevel} onChange={(e) => set("evidenceLevel", e.target.value)}>{Object.entries(EVIDENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="起始时间 / 成婚时间"><Input value={form.startDateText} onChange={(e) => set("startDateText", e.target.value)} placeholder="例如：1921 年" maxLength={100} /></Field>
            <Field label="结束时间"><Input value={form.endDateText} onChange={(e) => set("endDateText", e.target.value)} maxLength={100} /></Field>
            <Field label="婚姻次序（多次婚姻）"><Input type="number" min={1} max={50} value={form.marriageOrder} onChange={(e) => set("marriageOrder", e.target.value)} placeholder="可留空" /></Field>
          </div>
          <Field label="备注 / 依据说明"><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="例如：据 1998 年重修族谱卷二，或据家人口述（待考）" maxLength={2000} /></Field>
          <div className="flex items-start gap-1.5 rounded-lg border border-line bg-cream/50 p-3 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />自动检查：自反关系、重复关系、反向重复、生物学父母数量超过两位、血缘环、父母年龄倒挂、同名人物误合并、跨家族血缘自动关联。</div>
        </form>
      </Modal>

      {/* 编辑关系 */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑关系"
        description="修改核实状态时会重新执行冲突检测；存在血缘环等冲突的关系不能标记为已核实。"
        footer={<><Button variant="outline" size="sm" onClick={() => setEditing(null)}>取消</Button><Button variant="gold" size="sm" type="submit" form="relation-edit-form" loading={busy}>保存</Button></>}>
        {editing && <form id="relation-edit-form" onSubmit={submitEdit} className="space-y-3">
          <div className="rounded-lg border border-line bg-cream/50 p-3 text-xs text-ink">{nameOf(editing.fromPerson)} <ArrowRight className="mx-1 inline h-3 w-3 text-gold" /> {nameOf(editing.toPerson)} · {RELATION_LABELS[editing.type]}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="核实状态"><Select value={editForm.verification} onChange={(e) => setEditForm({ ...editForm, verification: e.target.value })}>{Object.entries(VERIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="依据可信程度"><Select value={editForm.evidenceLevel} onChange={(e) => setEditForm({ ...editForm, evidenceLevel: e.target.value })}>{Object.entries(EVIDENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="起始时间"><Input value={editForm.startDateText} onChange={(e) => setEditForm({ ...editForm, startDateText: e.target.value })} maxLength={100} /></Field>
            <Field label="结束时间"><Input value={editForm.endDateText} onChange={(e) => setEditForm({ ...editForm, endDateText: e.target.value })} maxLength={100} /></Field>
            <Field label="婚姻次序"><Input type="number" min={1} max={50} value={editForm.marriageOrder} onChange={(e) => setEditForm({ ...editForm, marriageOrder: e.target.value })} /></Field>
          </div>
          <Field label="备注 / 依据说明"><Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} maxLength={2000} /></Field>
        </form>}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="确认移除关系"
        description="该操作为软删除，会生成版本快照；亲属称谓计算将不再使用这条关系。"
        footer={<><Button variant="outline" size="sm" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>确认移除</Button></>}>
        {deleting && <p className="text-xs text-ink-soft">{nameOf(deleting.fromPerson)} → {nameOf(deleting.toPerson)} · {RELATION_LABELS[deleting.type]}</p>}
      </Modal>
    </div>
  );
}

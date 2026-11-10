"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search, Plus, Pencil, Trash2, RotateCcw, Eye, Info, AlertTriangle } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  Field, Modal, Notice, Pager, useAction, VISIBILITY_LABELS, VERIFICATION_LABELS,
  EVIDENCE_LABELS, RELATION_LABELS, SUBTYPE_LABELS, formatDate,
} from "@/components/family/shared";

type PersonRow = {
  id: string; name: string; surnameText: string; givenName: string; gender: string;
  isLiving: boolean; visibility: string; birthDateText: string | null; birthYear: number | null;
  deathDateText: string | null; deathYear: number | null; biography: string | null;
  courtesyName?: string | null; alias?: string | null; birthPrecision?: string | null;
  deathPrecision?: string | null; birthPlaceId?: string | null; ancestralHomeId?: string | null;
  generationNumber?: number | null; generationChar?: string | null; generationConfirmed?: boolean;
  branchId?: string | null; verification?: string | null; version?: number | null;
};
type PersonDetail = PersonRow & {
  sensitiveData: string | null;
  relations: Array<{ id: string; direction: string; person: { id: string; surnameText: string; givenName: string }; type: string; subtype: string; verification: string }>;
  documents: Array<{ id: string; title: string; category: string; linkType: string; verification: string }>;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };
type Branch = { id: string; name: string };
type Place = { id: string; historicalName: string; modernName: string | null };

const EMPTY_FORM = {
  surnameText: "", givenName: "", courtesyName: "", alias: "", gender: "UNKNOWN", isLiving: true,
  birthDateText: "", birthYear: "", birthPrecision: "UNKNOWN", deathDateText: "", deathYear: "", deathPrecision: "UNKNOWN",
  birthPlaceId: "", ancestralHomeId: "", biography: "", generationNumber: "", generationChar: "",
  generationConfirmed: false, branchId: "", visibility: "PRIVATE", sensitiveData: "", verification: "UNVERIFIED",
};
type FormState = typeof EMPTY_FORM;

const PRECISIONS = [
  ["UNKNOWN", "未标明"], ["EXACT", "精确到日"], ["YEAR", "仅年份"], ["MONTH", "精确到月"],
  ["RANGE", "时间段"], ["APPROXIMATE", "约略"], ["TEXT_ONLY", "仅文字纪年"],
] as const;

function toForm(p: PersonDetail | PersonRow, familySurname: string): FormState {
  const d = p as PersonDetail;
  return {
    surnameText: p.surnameText || familySurname,
    givenName: p.givenName ?? "",
    courtesyName: p.courtesyName ?? "",
    alias: p.alias ?? "",
    gender: p.gender ?? "UNKNOWN",
    isLiving: p.isLiving ?? true,
    birthDateText: p.birthDateText ?? "",
    birthYear: p.birthYear == null ? "" : String(p.birthYear),
    birthPrecision: p.birthPrecision ?? "UNKNOWN",
    deathDateText: p.deathDateText ?? "",
    deathYear: p.deathYear == null ? "" : String(p.deathYear),
    deathPrecision: p.deathPrecision ?? "UNKNOWN",
    birthPlaceId: p.birthPlaceId ?? "",
    ancestralHomeId: p.ancestralHomeId ?? "",
    biography: p.biography ?? "",
    generationNumber: p.generationNumber == null ? "" : String(p.generationNumber),
    generationChar: p.generationChar ?? "",
    generationConfirmed: p.generationConfirmed ?? false,
    branchId: p.branchId ?? "",
    visibility: p.visibility ?? "PRIVATE",
    sensitiveData: d.sensitiveData ?? "",
    verification: p.verification ?? "UNVERIFIED",
  };
}

function toPayload(f: FormState) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    surnameText: f.surnameText.trim(),
    givenName: f.givenName.trim(),
    courtesyName: f.courtesyName.trim() || null,
    alias: f.alias.trim() || null,
    gender: f.gender,
    isLiving: f.isLiving,
    birthDateText: f.birthDateText.trim() || null,
    birthYear: num(f.birthYear),
    birthPrecision: f.birthPrecision,
    deathDateText: f.deathDateText.trim() || null,
    deathYear: num(f.deathYear),
    deathPrecision: f.deathPrecision,
    birthPlaceId: f.birthPlaceId || null,
    ancestralHomeId: f.ancestralHomeId || null,
    biography: f.biography.trim() || null,
    generationNumber: num(f.generationNumber),
    generationChar: f.generationChar.trim() || null,
    generationConfirmed: f.generationConfirmed,
    branchId: f.branchId || null,
    visibility: f.visibility,
    sensitiveData: f.sensitiveData.trim() || null,
  };
}

export function PersonPanel({ familyId, familySurname, canWrite, onChanged }: {
  familyId: string; familySurname: string; canWrite: boolean; onChanged?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [deleting, setDeleting] = useState<PersonRow | null>(null);
  const [viewing, setViewing] = useState<PersonDetail | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const { busy, notice, setNotice, run } = useAction();

  const url = `/api/families/${familyId}/members?page=${page}&keyword=${encodeURIComponent(query)}`;
  const { data, error, isLoading, mutate } = useSWR<Paged<PersonRow>>(url, fetcher, { keepPreviousData: true });
  const { data: branches } = useSWR<Branch[]>(canWrite ? `/api/families/${familyId}/branches` : null, fetcher);
  const { data: placesData } = useSWR<Paged<Place>>(canWrite ? "/api/places?pageSize=100" : null, fetcher);
  const places = placesData?.items ?? [];

  const duplicateName = useMemo(() => {
    if (!editing) return null;
    const full = `${editing.form.surnameText.trim()}${editing.form.givenName.trim()}`;
    if (!editing.form.givenName.trim()) return null;
    return (data?.items ?? []).find((p) => p.name === full && p.id !== editing.id) ?? null;
  }, [editing, data]);

  const openCreate = () => setEditing({ id: null, form: { ...EMPTY_FORM, surnameText: familySurname } });
  const openEdit = async (row: PersonRow) => {
    try {
      const detail = await apiRequest<PersonDetail>(`/api/families/${familyId}/members/${row.id}`);
      setEditing({ id: row.id, form: toForm(detail, familySurname) });
    } catch (err) {
      setNotice({ kind: "error", title: err instanceof Error ? err.message : "读取人物资料失败" });
    }
  };
  const openView = async (row: PersonRow) => {
    try {
      setViewing(await apiRequest<PersonDetail>(`/api/families/${familyId}/members/${row.id}`));
    } catch (err) {
      setNotice({ kind: "error", title: err instanceof Error ? err.message : "读取人物资料失败" });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.form.givenName.trim() || !editing.form.surnameText.trim()) {
      setNotice({ kind: "error", title: "请填写姓氏与名字" });
      return;
    }
    if (editing.form.birthYear.trim() && !Number.isFinite(Number(editing.form.birthYear))) {
      setNotice({ kind: "error", title: "出生年份需为整数" });
      return;
    }
    const ok = await run(async () => {
      if (editing.id) {
        await apiRequest(`/api/families/${familyId}/members/${editing.id}`, { method: "PATCH", body: toPayload(editing.form) });
      } else {
        await apiRequest(`/api/families/${familyId}/members`, { method: "POST", body: toPayload(editing.form) });
      }
      await mutate();
      onChanged?.();
    }, editing.id ? "人物资料已更新，已生成版本快照" : "人物已添加，已生成版本快照");
    if (ok) setEditing(null);
  };

  const remove = async () => {
    if (!deleting) return;
    const ok = await run(async () => {
      await apiRequest(`/api/families/${familyId}/members/${deleting.id}`, { method: "DELETE" });
      await mutate();
      onChanged?.();
    }, "人物已移入回收站，可在回收站恢复");
    if (ok) setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">人物管理</h2>
          <p className="mt-1 text-xs text-graphite">人物与关系分开登记；同名人物不会自动合并，字辈必须人工确认。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setQuery(keyword.trim()); setPage(1); }} className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按名字检索" className="h-9 w-40 pl-8 text-xs" />
          </form>
          {canWrite && <Button size="sm" variant="outline" onClick={() => setTrashOpen(true)}><RotateCcw className="h-3.5 w-3.5" />回收站</Button>}
          {canWrite && <Button size="sm" variant="gold" onClick={openCreate}><Plus className="h-3.5 w-3.5" />添加人物</Button>}
        </div>
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {error && <Notice data={{ kind: "error", title: error instanceof Error ? error.message : "人物列表加载失败" }} />}

      {isLoading && !data && <div className="skeleton h-48 rounded-xl" />}
      {!isLoading && data && data.items.length === 0 && (
        <EmptyState title={query ? "没有匹配的人物" : "族谱中还没有人物"} description={query ? "试试更换关键词。" : "添加第一位人物后，就可以开始登记亲属关系并生成家族图谱。"} action={canWrite && !query ? <Button size="sm" variant="gold" onClick={openCreate}><Plus className="h-3.5 w-3.5" />添加人物</Button> : undefined} />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-cream/80 text-[11px] text-graphite">
                <tr>
                  <th className="px-4 py-2.5 font-medium">姓名</th>
                  <th className="px-4 py-2.5 font-medium">性别 / 状态</th>
                  <th className="px-4 py-2.5 font-medium">生卒</th>
                  <th className="px-4 py-2.5 font-medium">世代 / 字辈</th>
                  <th className="px-4 py-2.5 font-medium">可见性</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-cream/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{p.name}</div>
                      {(p.courtesyName || p.alias) && <div className="mt-0.5 text-[10px] text-graphite">字 {p.courtesyName || "—"} · 别名 {p.alias || "—"}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-graphite">
                      {p.gender === "MALE" ? "男" : p.gender === "FEMALE" ? "女" : "未知"} · {p.isLiving ? "在世" : "已故"}
                      {p.verification && p.verification !== "UNVERIFIED" && <Badge tone="jade" className="ml-1.5">{VERIFICATION_LABELS[p.verification]}</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-graphite">
                      {p.birthDateText || (p.birthYear ? `${p.birthYear} 年` : "—")} ~ {p.deathDateText || (p.deathYear ? `${p.deathYear} 年` : p.isLiving ? "—" : "—")}
                    </td>
                    <td className="px-4 py-2.5 text-graphite">
                      {p.generationNumber ? `第 ${p.generationNumber} 世` : "待确认"}
                      {p.generationChar ? ` · ${p.generationChar}字辈${p.generationConfirmed ? "（已确认）" : "（未确认）"}` : ""}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={p.visibility === "PUBLIC" ? "gold" : "neutral"}>{VISIBILITY_LABELS[p.visibility] ?? p.visibility}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="查看详情" onClick={() => void openView(p)}><Eye className="h-3.5 w-3.5" /></Button>
                        {canWrite && <Button size="icon" variant="ghost" title="编辑" onClick={() => void openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canWrite && <Button size="icon" variant="ghost" title="删除（可恢复）" onClick={() => setDeleting(p)}><Trash2 className="h-3.5 w-3.5 text-cinnabar" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </Card>
      )}

      {/* 新增 / 编辑 */}
      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)} wide
        title={editing?.id ? "编辑人物资料" : "添加人物"}
        description="带 * 为必填。日期可填写农历、朝代纪年等文本，另填整数年份用于排序与时间轴。"
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setEditing(null)}>取消</Button>
          <Button variant="gold" size="sm" type="submit" form="person-form" loading={busy}>保存并生成快照</Button>
        </>}
      >
        {editing && (
          <form onSubmit={save} id="person-form" className="space-y-5">
            {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
            {duplicateName && (
              <Notice data={{ kind: "warning", title: "检测到同名人物", lines: [`当前列表中已有「${duplicateName.name}」。系统不会自动合并；请确认这是不同的两个人，或返回列表检查是否重复录入。`] }} />
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="姓氏 *"><Input value={editing.form.surnameText} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, surnameText: e.target.value } })} maxLength={20} required /></Field>
              <Field label="名字 *"><Input value={editing.form.givenName} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, givenName: e.target.value } })} maxLength={100} required /></Field>
              <Field label="字"><Input value={editing.form.courtesyName} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, courtesyName: e.target.value } })} maxLength={100} /></Field>
              <Field label="别名 / 号"><Input value={editing.form.alias} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, alias: e.target.value } })} maxLength={200} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="性别"><Select value={editing.form.gender} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, gender: e.target.value } })}><option value="UNKNOWN">未知</option><option value="MALE">男</option><option value="FEMALE">女</option></Select></Field>
              <Field label="在世状态"><Select value={editing.form.isLiving ? "yes" : "no"} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, isLiving: e.target.value === "yes" } })}><option value="yes">在世</option><option value="no">已故</option></Select></Field>
              <Field label="资料核实状态"><Select value={editing.form.verification} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, verification: e.target.value } })}>{Object.entries(VERIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="可见范围" hint={editing.form.isLiving && editing.form.visibility === "PUBLIC" ? "在世人物设为公开时，系统会自动降级为家族可见。" : undefined}>
                <Select value={editing.form.visibility} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, visibility: e.target.value } })}>{Object.entries(VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
            </div>
            <div className="gold-rule" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="出生日期文本"><Input value={editing.form.birthDateText} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, birthDateText: e.target.value } })} placeholder="例如：光绪十二年 / 1950-03" maxLength={100} /></Field>
              <Field label="出生年份（整数）"><Input type="number" value={editing.form.birthYear} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, birthYear: e.target.value } })} placeholder="用于排序与时间轴" /></Field>
              <Field label="出生日期精度"><Select value={editing.form.birthPrecision} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, birthPrecision: e.target.value } })}>{PRECISIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="逝世日期文本"><Input value={editing.form.deathDateText} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, deathDateText: e.target.value } })} maxLength={100} /></Field>
              <Field label="逝世年份（整数）"><Input type="number" value={editing.form.deathYear} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, deathYear: e.target.value } })} /></Field>
              <Field label="逝世日期精度"><Select value={editing.form.deathPrecision} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, deathPrecision: e.target.value } })}>{PRECISIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="出生地（古今地名库）"><Select value={editing.form.birthPlaceId} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, birthPlaceId: e.target.value } })}><option value="">未填写</option>{places.map((p) => <option key={p.id} value={p.id}>{p.historicalName}{p.modernName ? `（今 ${p.modernName}）` : ""}</option>)}</Select></Field>
              <Field label="祖籍地（古今地名库）"><Select value={editing.form.ancestralHomeId} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, ancestralHomeId: e.target.value } })}><option value="">未填写</option>{places.map((p) => <option key={p.id} value={p.id}>{p.historicalName}{p.modernName ? `（今 ${p.modernName}）` : ""}</option>)}</Select></Field>
            </div>
            <div className="gold-rule" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="世代序号"><Input type="number" min={1} max={500} value={editing.form.generationNumber} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, generationNumber: e.target.value } })} placeholder="第几世" /></Field>
              <Field label="字辈用字"><Input value={editing.form.generationChar} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, generationChar: e.target.value } })} maxLength={10} /></Field>
              <Field label="所属分支"><Select value={editing.form.branchId} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, branchId: e.target.value } })}><option value="">未分分支</option>{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <div className="flex items-end pb-1">
                <label className="flex items-start gap-2 text-[11px] leading-5 text-ink-soft">
                  <input type="checkbox" checked={editing.form.generationConfirmed} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, generationConfirmed: e.target.checked } })} className="mt-0.5 accent-[#b08d57]" />
                  <span>字辈已人工确认<br /><span className="text-graphite">系统不会从姓名推断辈分</span></span>
                </label>
              </div>
            </div>
            <Field label="生平 / 传记"><Textarea rows={3} value={editing.form.biography} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, biography: e.target.value } })} placeholder="不确定的内容请明确标注为待考证" maxLength={20000} /></Field>
            {canWrite && (
              <Field label="敏感资料（仅协作者可见，加密存储）" hint="联系方式、详细住址等。此字段不会进入版本快照，也不会出现在搜索结果中。">
                <Textarea rows={2} value={editing.form.sensitiveData} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sensitiveData: e.target.value } })} maxLength={4000} />
              </Field>
            )}
          </form>
        )}
      </Modal>

      {/* 删除确认 */}
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="确认移除人物"
        description="此为软删除，人物与其关系会移入回收站，可随时恢复；所有变更均有版本快照。"
        footer={<><Button variant="outline" size="sm" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>确认移除</Button></>}>
        {deleting && <div className="space-y-2 text-xs text-ink-soft">
          <div>即将移除：<strong className="font-serif text-base text-ink">{deleting.name}</strong></div>
          <div className="flex items-start gap-1.5 text-graphite"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-gold" />关联关系会一并隐藏，恢复人物时同一批次的关系会一并恢复。</div>
        </div>}
      </Modal>

      {/* 人物详情 */}
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="人物档案" wide
        footer={<Button variant="outline" size="sm" onClick={() => setViewing(null)}>关闭</Button>}>
        {viewing && <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-xl text-ink">{viewing.name}</span>
            <Badge tone={viewing.gender === "FEMALE" ? "red" : "navy"}>{viewing.gender === "FEMALE" ? "女" : viewing.gender === "MALE" ? "男" : "未知"}</Badge>
            <Badge tone="neutral">{viewing.isLiving ? "在世" : "已故"}</Badge>
            <Badge tone={viewing.visibility === "PUBLIC" ? "gold" : "neutral"}>{VISIBILITY_LABELS[viewing.visibility]}</Badge>
          </div>
          <div className="grid gap-2 rounded-lg border border-line bg-cream/50 p-3 sm:grid-cols-2">
            <div>出生：{viewing.birthDateText || (viewing.birthYear ? `${viewing.birthYear} 年` : "未记录")}</div>
            <div>逝世：{viewing.deathDateText || (viewing.deathYear ? `${viewing.deathYear} 年` : "未记录")}</div>
            <div>世代：{viewing.generationNumber ? `第 ${viewing.generationNumber} 世` : "待确认"}</div>
            <div>字辈：{viewing.generationChar || "未登记"}{viewing.generationConfirmed ? "（已人工确认）" : ""}</div>
          </div>
          {viewing.biography && <div className="leading-6 text-ink-soft">{viewing.biography}</div>}
          {viewing.sensitiveData && <div className="rounded-lg border border-[#e5d3ae] bg-[#faf4e6] p-3 text-[11px] leading-5 text-[#8a6a35]"><strong>敏感资料（加密存储，仅协作者可见）：</strong><br />{viewing.sensitiveData}</div>}
          <div>
            <h4 className="mb-2 font-medium text-ink">已登记关系（{viewing.relations.length}）</h4>
            {viewing.relations.length === 0 ? <p className="text-graphite">尚无关系记录。仅已核实的关系会参与亲属称谓计算。</p> : (
              <ul className="space-y-1.5">
                {viewing.relations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5">
                    <span className="text-graphite">{r.direction === "out" ? "→" : "←"}</span>
                    <span className="text-ink">{r.person.surnameText}{r.person.givenName}</span>
                    <Badge tone="neutral">{RELATION_LABELS[r.type] ?? r.type}</Badge>
                    <Badge tone="neutral">{SUBTYPE_LABELS[r.subtype] ?? r.subtype}</Badge>
                    <Badge tone={r.verification === "VERIFIED" ? "jade" : "gold"}>{VERIFICATION_LABELS[r.verification] ?? r.verification}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {viewing.documents.length > 0 && <div>
            <h4 className="mb-2 font-medium text-ink">关联档案（{viewing.documents.length}）</h4>
            <ul className="space-y-1 text-graphite">{viewing.documents.map((d) => <li key={d.id}>· {d.title}（{d.category} · {EVIDENCE_LABELS[d.verification] ?? d.verification}）</li>)}</ul>
          </div>}
          <div className="flex items-start gap-1.5 border-t border-line pt-3 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />关系与辈分均以已核实登记为准；系统不会因同名或同姓自动认定血缘。</div>
        </div>}
      </Modal>

      {trashOpen && <TrashModal familyId={familyId} canWrite={canWrite} onClose={() => setTrashOpen(false)} onRestored={() => { void mutate(); onChanged?.(); }} />}
    </div>
  );
}

function TrashModal({ familyId, canWrite, onClose, onRestored }: {
  familyId: string; canWrite: boolean; onClose: () => void; onRestored: () => void;
}) {
  const { data, mutate, isLoading } = useSWR<Paged<{ id: string; surnameText: string; givenName: string; deletedAt: string }>>(
    `/api/families/${familyId}/members/trash`, fetcher,
  );
  const { busy, notice, run } = useAction();
  const restore = async (id: string) => {
    const ok = await run(async () => {
      await apiRequest(`/api/families/${familyId}/members/${id}/restore`, { method: "POST" });
      await mutate();
      onRestored();
    }, "人物与同批关系已恢复");
    if (ok) return;
  };
  return (
    <Modal open onClose={onClose} title="回收站 · 已移除人物" wide
      description="软删除的人物及其同批关系可在此恢复；恢复操作同样会生成版本快照。"
      footer={<Button variant="outline" size="sm" onClick={onClose}>关闭</Button>}>
      <div className="space-y-3">
        {notice && <Notice data={notice} />}
        {isLoading && <div className="skeleton h-20 rounded-lg" />}
        {data && data.items.length === 0 && <EmptyState title="回收站为空" description="被移除的人物会显示在这里。" />}
        {data && data.items.length > 0 && (
          <ul className="space-y-2">
            {data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                <div><span className="font-medium text-ink">{p.surnameText}{p.givenName}</span><span className="ml-2 text-[11px] text-graphite">移除于 {formatDate(p.deletedAt)}</span></div>
                {canWrite && <Button size="sm" variant="outline" loading={busy} onClick={() => void restore(p.id)}><RotateCcw className="h-3 w-3" />恢复</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

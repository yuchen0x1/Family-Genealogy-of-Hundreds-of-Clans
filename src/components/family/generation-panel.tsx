"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, BookOpen, GitBranch, Info, ShieldCheck } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import { Field, Modal, Notice, useAction, formatDate } from "@/components/family/shared";

type Generation = {
  id: string; generationNumber: number; generationChar: string | null;
  poemLine: string | null; notes: string | null;
};
type Poem = {
  id: string; title: string; content: string; characters: string[];
  reviewStatus: string; sourceText: string | null; branchId: string | null; createdAt: string;
};
type Branch = {
  id: string; name: string; color: string | null; parentId: string | null;
  description: string | null; createdAt: string;
  _count: { members: number };
  rootPerson: { id: string; surnameText: string; givenName: string } | null;
};
type PersonOption = { id: string; name: string };
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export function GenerationPanel({ familyId, canWrite, onChanged }: {
  familyId: string; canWrite: boolean; onChanged?: () => void;
}) {
  const { data, mutate, isLoading } = useSWR<{ generations: Generation[]; poems: Poem[] }>(
    `/api/families/${familyId}/generations`, fetcher,
  );
  const { data: branches, mutate: mutateBranches } = useSWR<Branch[]>(`/api/families/${familyId}/branches`, fetcher);
  const { data: people } = useSWR<Paged<PersonOption>>(canWrite ? `/api/families/${familyId}/members?pageSize=100` : null, fetcher);
  const { busy, notice, setNotice, run } = useAction();

  const [genForm, setGenForm] = useState({ generationNumber: "", generationChar: "", poemLine: "", notes: "" });
  const [poemForm, setPoemForm] = useState({ title: "", content: "", sourceText: "", branchId: "" });
  const [branchForm, setBranchForm] = useState({ name: "", parentId: "", rootPersonId: "", color: "", description: "" });
  const [modal, setModal] = useState<"generation" | "poem" | "branch" | null>(null);

  const open = (which: "generation" | "poem" | "branch") => { setNotice(null); setModal(which); };

  const saveGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(genForm.generationNumber);
    if (!Number.isInteger(n) || n < 1 || n > 500) { setNotice({ kind: "error", title: "世代序号需为 1–500 的整数" }); return; }
    const ok = await run(async () => {
      await apiRequest(`/api/families/${familyId}/generations`, {
        method: "POST",
        body: {
          generationNumber: n,
          generationChar: genForm.generationChar.trim() || null,
          poemLine: genForm.poemLine.trim() || null,
          notes: genForm.notes.trim() || null,
        },
      });
      await mutate();
      onChanged?.();
    }, "世代字辈已保存（由人工录入，未从姓名推断）");
    if (ok) { setModal(null); setGenForm({ generationNumber: "", generationChar: "", poemLine: "", notes: "" }); }
  };

  const savePoem = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(async () => {
      await apiRequest(`/api/families/${familyId}/poems`, {
        method: "POST",
        body: {
          title: poemForm.title.trim(),
          content: poemForm.content.trim(),
          sourceText: poemForm.sourceText.trim() || null,
          branchId: poemForm.branchId || null,
        },
      });
      await mutate();
      onChanged?.();
    }, "字辈诗已录入，状态为待审核");
    if (ok) { setModal(null); setPoemForm({ title: "", content: "", sourceText: "", branchId: "" }); }
  };

  const saveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(async () => {
      await apiRequest(`/api/families/${familyId}/branches`, {
        method: "POST",
        body: {
          name: branchForm.name.trim(),
          parentId: branchForm.parentId || null,
          rootPersonId: branchForm.rootPersonId || null,
          color: branchForm.color || null,
          description: branchForm.description.trim() || null,
        },
      });
      await mutateBranches();
      onChanged?.();
    }, "分支已创建");
    if (ok) { setModal(null); setBranchForm({ name: "", parentId: "", rootPersonId: "", color: "", description: "" }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">字辈 · 世代 · 分支</h2>
          <p className="mt-1 text-xs text-graphite">字辈必须人工录入并确认，平台不会根据名字自动推断辈分或归类人物。</p>
        </div>
        {canWrite && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => open("generation")}><Plus className="h-3.5 w-3.5" />登记世代</Button>
          <Button size="sm" variant="outline" onClick={() => open("poem")}><BookOpen className="h-3.5 w-3.5" />录入字辈诗</Button>
          <Button size="sm" variant="gold" onClick={() => open("branch")}><GitBranch className="h-3.5 w-3.5" />新建分支</Button>
        </div>}
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      <Notice data={{ kind: "warning", title: "字辈数据纪律", lines: ["字辈用字与世代对应关系须由家族成员依据族谱、碑文或口述明确登记；系统不会从姓名中的某个字自动认定世代。", "字辈诗录入后默认为待审核，不会自动把人物归入对应世代。"] }} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">世代字辈表（{data?.generations.length ?? 0}）</h3></CardHeader>
          <CardBody className="p-0">
            {isLoading && <div className="skeleton m-4 h-24 rounded-lg" />}
            {data && data.generations.length === 0 && <div className="p-4"><EmptyState title="尚未登记世代" description="按族谱记载逐代录入字辈用字。" /></div>}
            {data && data.generations.length > 0 && (
              <ul className="divide-y divide-line/70">
                {data.generations.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                    <Badge tone="navy">第 {g.generationNumber} 世</Badge>
                    {g.generationChar && <span className="font-serif text-lg text-navy">{g.generationChar}</span>}
                    {g.poemLine && <span className="text-graphite">{g.poemLine}</span>}
                    {g.notes && <span className="ml-auto text-[11px] text-graphite">{g.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">字辈诗 / 派语（{data?.poems.length ?? 0}）</h3></CardHeader>
          <CardBody className="p-0">
            {data && data.poems.length === 0 && <div className="p-4"><EmptyState title="尚未录入字辈诗" description="录入时请注明来源，例如某版族谱卷次。" /></div>}
            {data && data.poems.length > 0 && (
              <ul className="divide-y divide-line/70">
                {data.poems.map((p) => (
                  <li key={p.id} className="px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{p.title}</span>
                      <Badge tone={p.reviewStatus === "APPROVED" ? "jade" : "gold"}>{p.reviewStatus === "APPROVED" ? "已审核" : "待审核"}</Badge>
                      <span className="ml-auto text-[11px] text-graphite">{formatDate(p.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 font-serif leading-6 text-ink-soft">{p.content}</p>
                    {p.sourceText && <p className="mt-1 text-[11px] text-graphite">来源：{p.sourceText}</p>}
                    {p.characters?.length > 0 && <p className="mt-1 text-[11px] text-graphite">切分用字 {p.characters.length} 个（仅供参考，未自动关联人物）</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="font-serif text-sm font-semibold text-ink">家族分支（{branches?.length ?? 0}）</h3><p className="mt-1 text-[11px] text-graphite">分支用于区分同一家族内的不同支系，不会因姓氏相同而与外部家族合并。</p></CardHeader>
        <CardBody className="p-0">
          {branches && branches.length === 0 && <div className="p-4"><EmptyState title="尚未划分分支" description="可按始迁祖、迁徙地或房支建立分支。" /></div>}
          {branches && branches.length > 0 && (
            <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <div key={b.id} className="rounded-lg border border-line bg-white p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: b.color || "#b08d57" }} />
                    <span className="font-medium text-ink">{b.name}</span>
                    <Badge tone="neutral" className="ml-auto">{b._count.members} 人</Badge>
                  </div>
                  {b.rootPerson && <div className="mt-1.5 text-[11px] text-graphite">支祖：{b.rootPerson.surnameText}{b.rootPerson.givenName}</div>}
                  {b.description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-graphite">{b.description}</p>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={modal === "generation"} onClose={() => setModal(null)} title="登记世代字辈"
        description="同一世代重复登记会更新已有记录。字辈用字须人工确认。"
        footer={<><Button variant="outline" size="sm" onClick={() => setModal(null)}>取消</Button><Button variant="gold" size="sm" type="submit" form="gen-form" loading={busy}>保存</Button></>}>
        <form id="gen-form" onSubmit={saveGeneration} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="世代序号 *"><Input type="number" min={1} max={500} value={genForm.generationNumber} onChange={(e) => setGenForm({ ...genForm, generationNumber: e.target.value })} required /></Field>
            <Field label="字辈用字"><Input value={genForm.generationChar} onChange={(e) => setGenForm({ ...genForm, generationChar: e.target.value })} maxLength={10} /></Field>
          </div>
          <Field label="对应派语 / 诗句"><Input value={genForm.poemLine} onChange={(e) => setGenForm({ ...genForm, poemLine: e.target.value })} maxLength={500} /></Field>
          <Field label="依据说明" hint="例如：据 1998 年重修《某氏族谱》卷一"><Textarea rows={2} value={genForm.notes} onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })} maxLength={1000} /></Field>
          <div className="flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />保存后仍需到人物资料中逐人确认字辈，系统不会自动套用。</div>
        </form>
      </Modal>

      <Modal open={modal === "poem"} onClose={() => setModal(null)} title="录入字辈诗 / 派语"
        description="录入后默认为待审核状态；诗句可按标点自动切分为候选用字，但不会自动关联人物。"
        footer={<><Button variant="outline" size="sm" onClick={() => setModal(null)}>取消</Button><Button variant="gold" size="sm" type="submit" form="poem-form" loading={busy}>录入</Button></>}>
        <form id="poem-form" onSubmit={savePoem} className="space-y-3">
          <Field label="标题 *"><Input value={poemForm.title} onChange={(e) => setPoemForm({ ...poemForm, title: e.target.value })} placeholder="例如：某氏二十字派语" required maxLength={200} /></Field>
          <Field label="字辈诗正文 *"><Textarea rows={3} value={poemForm.content} onChange={(e) => setPoemForm({ ...poemForm, content: e.target.value })} placeholder="例如：文章华国，诗礼传家……" required maxLength={20000} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="适用分支"><Select value={poemForm.branchId} onChange={(e) => setPoemForm({ ...poemForm, branchId: e.target.value })}><option value="">全族通用</option>{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="资料来源"><Input value={poemForm.sourceText} onChange={(e) => setPoemForm({ ...poemForm, sourceText: e.target.value })} maxLength={1000} placeholder="族谱版本 / 卷次 / 口述人" /></Field>
          </div>
          <div className="flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />没有可靠来源时请如实标注「口述待考」，不要写成已审定史实。</div>
        </form>
      </Modal>

      <Modal open={modal === "branch"} onClose={() => setModal(null)} title="新建家族分支"
        description="分支用于标记家族内部支系；跨家族关联需另行明确登记。"
        footer={<><Button variant="outline" size="sm" onClick={() => setModal(null)}>取消</Button><Button variant="gold" size="sm" type="submit" form="branch-form" loading={busy}>创建</Button></>}>
        <form id="branch-form" onSubmit={saveBranch} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="分支名称 *"><Input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required maxLength={200} /></Field>
            <Field label="标识颜色"><Input value={branchForm.color} onChange={(e) => setBranchForm({ ...branchForm, color: e.target.value })} placeholder="#b08d57" maxLength={20} /></Field>
            <Field label="上级分支"><Select value={branchForm.parentId} onChange={(e) => setBranchForm({ ...branchForm, parentId: e.target.value })}><option value="">无（顶级分支）</option>{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="支祖人物"><Select value={branchForm.rootPersonId} onChange={(e) => setBranchForm({ ...branchForm, rootPersonId: e.target.value })}><option value="">未指定</option>{(people?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
          <Field label="分支说明"><Textarea rows={2} value={branchForm.description} onChange={(e) => setBranchForm({ ...branchForm, description: e.target.value })} maxLength={2000} /></Field>
        </form>
      </Modal>
    </div>
  );
}

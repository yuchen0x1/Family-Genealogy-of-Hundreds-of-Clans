"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Input, Select, Textarea, Label } from "@/components/ui/primitives";
import { Field, Notice, parseError, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";

type SurnameOption = { id: string; name: string };
type FamilyOption = { id: string; name: string; visibility: string };

const TYPES = [
  { value: "SEEK_RELATIVE", label: "寻亲信息" },
  { value: "DISCUSSION", label: "家族讨论" },
  { value: "FAMILY_NEWS", label: "家族动态" },
  { value: "EVENT", label: "宗亲活动" },
  { value: "CORRECTION", label: "史料纠错" },
  { value: "ANNOUNCEMENT", label: "平台公告（仅审核人员）" },
];

export function PostForm() {
  const router = useRouter();
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const { data: surnames } = useSWR<{ items: SurnameOption[] }>("/api/surnames?pageSize=100", fetcher);
  const { data: families } = useSWR<{ items: FamilyOption[] }>("/api/families?mine=1&pageSize=100", fetcher);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [form, setForm] = useState({
    title: "", content: "", type: "DISCUSSION", visibility: "PUBLIC",
    surnameId: "", familyId: "", tags: "",
    ancestralHome: "", generationPoem: "", clueSurname: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isModerator = Boolean(me?.user?.isAdmin || me?.user?.roles?.includes("moderator"));
  const needFamily = form.visibility === "FAMILY";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (needFamily && !form.familyId) { setNotice({ kind: "error", title: "请选择所属家族" }); return; }
    setBusy(true);
    try {
      const clues: Record<string, string> = {};
      if (form.type === "SEEK_RELATIVE") {
        if (form.ancestralHome.trim()) clues.ancestralHome = form.ancestralHome.trim();
        if (form.generationPoem.trim()) clues.generationPoem = form.generationPoem.trim();
        if (form.clueSurname.trim()) clues.surname = form.clueSurname.trim();
      }
      const result = await apiRequest<{ id: string }>("/api/posts", {
        method: "POST",
        body: {
          title: form.title, content: form.content, type: form.type,
          visibility: form.visibility,
          ...(form.surnameId ? { surnameId: form.surnameId } : {}),
          ...(form.familyId ? { familyId: form.familyId } : {}),
          ...(Object.keys(clues).length ? { clues } : {}),
          tags: form.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
        },
      });
      router.push(`/community/${result.id}`);
    } catch (err) { setNotice(parseError(err)); setBusy(false); }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
        <Card>
          <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">内容信息</h2></CardHeader>
          <CardBody className="space-y-4">
            <Field label="标题 *" hint="请准确描述主题，寻亲信息建议注明姓氏与祖籍线索">
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} required minLength={2} maxLength={300} placeholder="例如：寻河南颍川陈氏「守建晓念」字辈宗亲" />
            </Field>
            <Field label="正文 *" hint="请勿公布他人身份证号、联系方式等敏感信息；平台会按可见性严格过滤">
              <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} required minLength={2} maxLength={20000} rows={9} placeholder="写下线索、问题或讨论内容…" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="内容类型 *">
                <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
                  {TYPES.filter((t) => t.value !== "ANNOUNCEMENT" || isModerator).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="标签" hint="以逗号分隔，最多 10 个">
                <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="寻亲,字辈,颍川" />
              </Field>
            </div>
          </CardBody>
        </Card>

        {form.type === "SEEK_RELATIVE" && (
          <Card>
            <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">寻亲线索（结构化）</h2></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Field label="祖籍地"><Input value={form.ancestralHome} onChange={(e) => set("ancestralHome", e.target.value)} placeholder="如：河南许昌" /></Field>
              <Field label="字辈"><Input value={form.generationPoem} onChange={(e) => set("generationPoem", e.target.value)} placeholder="如：守建晓念" /></Field>
              <Field label="姓氏"><Input value={form.clueSurname} onChange={(e) => set("clueSurname", e.target.value)} placeholder="如：陈" /></Field>
              <p className="sm:col-span-3 text-[11px] leading-5 text-graphite">线索仅用于检索与人工比对；系统不会因姓氏或字辈相同自动认定同宗或合并家族。</p>
            </CardBody>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader><h2 className="font-serif text-sm font-semibold text-ink">发布范围</h2></CardHeader>
          <CardBody className="space-y-4">
            <Field label="可见性 *">
              <Select value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
                <option value="PUBLIC">公开（所有访客可见）</option>
                <option value="FAMILY">家族可见（仅所选家族协作者）</option>
                <option value="PRIVATE">仅自己可见</option>
              </Select>
            </Field>
            <Field label="关联家族" hint={needFamily ? "家族可见时必须选择一个参与的家族" : "可选，便于按家族归档"}>
              <Select value={form.familyId} onChange={(e) => set("familyId", e.target.value)}>
                <option value="">不关联</option>
                {(families?.items ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="关联姓氏" hint="可选，用于姓氏文化页聚合展示">
              <Select value={form.surnameId} onChange={(e) => set("surnameId", e.target.value)}>
                <option value="">不关联</option>
                {(surnames?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}姓</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card className="border-gold/40 bg-[#fbf7ee]">
          <CardBody>
            <Label className="mb-2 block">发布前须知</Label>
            <ul className="space-y-1.5 text-[11px] leading-5 text-graphite">
              <li>· 请确认已获得涉及人物（尤其在世者）的同意。</li>
              <li>· 史料纠错需注明出处，审核前不作为定论。</li>
              <li>· 发布后仍可编辑或删除；删除为软删除，保留审计记录。</li>
              <li>· 同姓不代表同宗，平台不会自动建立亲属关系。</li>
            </ul>
          </CardBody>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="gold" loading={busy} className="flex-1">发布内容</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        </div>
      </aside>
    </form>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ShieldCheck, Info } from "lucide-react";
import { apiRequest, fetcher, type MeResponse } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Input, Label, Select, Textarea, Badge } from "@/components/ui/primitives";
import { Field, Notice, useAction, VISIBILITY_LABELS } from "@/components/family/shared";

export function FamilyCreateForm() {
  const router = useRouter();
  const { data: me, isLoading } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const { busy, notice, setNotice, run } = useAction();
  const [form, setForm] = useState({
    name: "", surnameText: "", founderName: "", ancestralHome: "",
    hallName: "", description: "", visibility: "PRIVATE",
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.surnameText.trim()) {
      setNotice({ kind: "error", title: "请填写家族名称与姓氏" });
      return;
    }
    const ok = await run(async () => {
      const created = await apiRequest<{ id: string }>("/api/families", {
        method: "POST",
        body: {
          name: form.name.trim(),
          surnameText: form.surnameText.trim(),
          founderName: form.founderName.trim() || null,
          ancestralHome: form.ancestralHome.trim() || null,
          hallName: form.hallName.trim() || null,
          description: form.description.trim() || null,
          visibility: form.visibility,
        },
      });
      router.push(`/families/${created.id}`);
      router.refresh();
    });
    if (!ok) return;
  };

  if (isLoading) return <div className="skeleton h-96 rounded-xl" />;
  if (!me?.authenticated) {
    return (
      <Card><CardBody>
        <Notice data={{ kind: "warning", title: "创建族谱需要先登录", lines: ["登录后可以创建私有族谱，并邀请家族成员协作维护。"] }} />
        <div className="mt-4 flex gap-2">
          <Link href="/login?next=/families/new"><Button size="sm">前往登录</Button></Link>
          <Link href="/register"><Button size="sm" variant="outline">注册账号</Button></Link>
        </div>
      </CardBody></Card>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader><h2 className="font-serif text-lg font-semibold text-ink">家族基本信息</h2><p className="mt-1 text-xs text-graphite">带 * 的项目为必填，其他信息可后续补充。</p></CardHeader>
        <CardBody className="space-y-4">
          {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="家族名称 *" hint="建议使用「地名 + 姓氏 + 族谱」这类可区分的命名，便于与同姓其他家族区分。">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：颍川陈氏族谱" maxLength={200} required />
            </Field>
            <Field label="姓氏 *" hint="仅作为资料标记，不会据此自动关联其他家族。">
              <Input value={form.surnameText} onChange={(e) => set("surnameText", e.target.value)} placeholder="例如：陈" maxLength={20} required />
            </Field>
            <Field label="始祖 / 始迁祖姓名"><Input value={form.founderName} onChange={(e) => set("founderName", e.target.value)} placeholder="可留空" maxLength={100} /></Field>
            <Field label="堂号"><Input value={form.hallName} onChange={(e) => set("hallName", e.target.value)} placeholder="例如：颍川堂" maxLength={100} /></Field>
          </div>
          <Field label="祖籍地" hint="建议填写可核验的今地名；有史料依据时可在档案中补充来源。">
            <Input value={form.ancestralHome} onChange={(e) => set("ancestralHome", e.target.value)} placeholder="例如：河南省许昌市" maxLength={300} />
          </Field>
          <Field label="家族简介">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="简要说明家族来源、已知支系与资料情况；不确定的内容请标注为待考证。" maxLength={10000} />
          </Field>
          <div>
            <Label htmlFor="visibility">可见范围</Label>
            <Select id="visibility" value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
              <option value="PRIVATE">私有（仅本人与受邀协作者）</option>
              <option value="FAMILY">家族可见（已登录的协作者）</option>
              <option value="PUBLIC">公开（所有人可浏览，仍需逐人设置隐私）</option>
            </Select>
            <p className="mt-1.5 text-[11px] leading-5 text-graphite">
              当前选择：<Badge tone={form.visibility === "PUBLIC" ? "gold" : "neutral"}>{VISIBILITY_LABELS[form.visibility]}</Badge>
              {form.visibility === "PUBLIC" && " 公开后，族谱名称与已主动公开的人物会进入全站搜索；在世人物仍默认被保护。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button type="submit" variant="gold" loading={busy}>创建族谱</Button>
            <Link href="/families" className="text-xs text-graphite hover:text-ink">取消</Link>
          </div>
        </CardBody>
      </Card>

      <aside className="space-y-4">
        <Card><CardBody>
          <h3 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-jade" />隐私默认原则</h3>
          <ul className="space-y-2 text-[11px] leading-5 text-graphite">
            <li>· 新建族谱默认私有，不进入公开列表与搜索结果。</li>
            <li>· 在世人物的敏感资料单独加密保存，仅家族协作者可见。</li>
            <li>· 即使把在世人物设为「公开」，系统也会自动降级为「家族可见」。</li>
            <li>· 每次人物与关系变更都会生成版本快照，可恢复。</li>
          </ul>
        </CardBody></Card>
        <Card><CardBody>
          <h3 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink"><Info className="h-4 w-4 text-gold" />同姓不同宗</h3>
          <p className="text-[11px] leading-5 text-graphite">
            姓氏相同不代表存在血缘关系。平台不会自动合并同姓家族，也不会依据姓名推断辈分或亲属关系。
            所有亲属结论都建立在用户明确登记并核实的关系之上。
          </p>
          <Link href="/surnames" className="mt-3 inline-block text-[11px] text-navy underline underline-offset-4">查看姓氏知识库 →</Link>
        </CardBody></Card>
      </aside>
    </form>
  );
}

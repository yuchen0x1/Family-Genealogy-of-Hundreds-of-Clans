"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { ArrowLeft, Users, GitBranch, FileText, Lock, Globe, ShieldCheck, BookOpen, Network, ListTree, History, UserCog, Settings2, FolderArchive, ArrowLeftRight, BarChart3 } from "lucide-react";
import { fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Notice, VISIBILITY_LABELS } from "@/components/family/shared";
import { GenealogyGraph } from "@/components/genealogy-graph";
import { PersonPanel } from "@/components/family/person-panel";
import { RelationPanel } from "@/components/family/relation-panel";
import { GenerationPanel } from "@/components/family/generation-panel";
import { VersionPanel } from "@/components/family/version-panel";
import { CollaboratorPanel } from "@/components/family/collaborator-panel";
import { SettingsPanel, type FamilyDetail } from "@/components/family/settings-panel";
import { ArchivePanel } from "@/components/family/archive-panel";
import { ImportExportPanel } from "@/components/family/import-export-panel";
import { FamilyStatsPanel } from "@/components/family/family-stats-panel";

const TABS = [
  { key: "graph", label: "关系图谱", icon: Network },
  { key: "stats", label: "家族统计", icon: BarChart3 },
  { key: "people", label: "人物管理", icon: Users },
  { key: "relations", label: "关系管理", icon: ListTree },
  { key: "generations", label: "字辈与分支", icon: BookOpen },
  { key: "archive", label: "家族档案", icon: FolderArchive },
  { key: "io", label: "导入导出", icon: ArrowLeftRight },
  { key: "versions", label: "版本与恢复", icon: History },
  { key: "collaborators", label: "家族协作", icon: UserCog },
  { key: "settings", label: "族谱设置", icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function FamilyWorkspace({ familyId }: { familyId: string }) {
  const [tab, setTab] = useState<TabKey>("graph");
  const detailUrl = `/api/families/${familyId}`;
  const { data: family, error, isLoading, mutate } = useSWR<FamilyDetail>(detailUrl, fetcher);
  const { mutate: mutateAll } = useSWRConfig();

  /** 任一面板写入后，刷新家族统计与图谱 SWR 缓存，保证各视图一致。 */
  const refresh = () => {
    void mutate();
    void mutateAll((key) => typeof key === "string" && key.startsWith(`/api/families/${familyId}`));
  };

  if (isLoading && !family) {
    return <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 md:px-6"><div className="skeleton h-36 rounded-xl" /><div className="skeleton h-12 rounded-xl" /><div className="skeleton h-96 rounded-xl" /></div>;
  }

  if (error || !family) {
    const status = (error as Error & { status?: number })?.status;
    const forbidden = status === 403;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <Card><CardBody>
          <EmptyState
            title={forbidden ? "这份族谱是私有的" : status === 404 ? "族谱不存在或已删除" : "族谱加载失败"}
            description={forbidden
              ? "私有族谱仅创建者与受邀协作者可见。若你收到了邀请链接，请先登录并使用与邀请一致的邮箱接受邀请。"
              : status === 404 ? "请检查链接是否正确，或返回族谱中心浏览公开族谱。" : (error instanceof Error ? error.message : "请稍后重试")}
            action={<div className="flex flex-wrap justify-center gap-2">
              {forbidden && <Link href="/login"><Button size="sm">登录账号</Button></Link>}
              <Link href="/families"><Button size="sm" variant="outline">返回族谱中心</Button></Link>
            </div>}
          />
          <div className="mt-4"><Notice data={{ kind: "warning", title: "隐私说明", lines: ["平台不会通过错误信息透露私有族谱中的人物、关系或家庭资料。"] }} /></div>
        </CardBody></Card>
      </div>
    );
  }

  const level = family.access.level;
  const canWrite = ["OWNER", "ADMIN", "EDITOR"].includes(level ?? "");
  const canManage = ["OWNER", "ADMIN"].includes(level ?? "");
  const isOwner = family.access.isOwner;
  const hasAccess = Boolean(level);

  return (
    <div className="paper-bg min-h-screen">
      <section className="ink-bg border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-9 md:px-6">
          <Link href="/families" className="mb-5 inline-flex items-center gap-1.5 text-xs text-white/60 transition hover:text-gold-light"><ArrowLeft className="h-3.5 w-3.5" />返回族谱中心</Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-semibold text-white md:text-3xl">{family.name}</h1>
                <Badge tone="gold">{family.surnameText}姓</Badge>
                {family.isDemo && <Badge tone="red">演示数据 · 非真实家族</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/65">
                <span className="inline-flex items-center gap-1">{family.visibility === "PUBLIC" ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{VISIBILITY_LABELS[family.visibility]}</span>
                {family.hallName && <><span>·</span><span>{family.hallName}</span></>}
                {family.ancestralHome && <><span>·</span><span>祖籍 {family.ancestralHome}</span></>}
                {family.founderName && <><span>·</span><span>始祖 {family.founderName}</span></>}
              </div>
              {family.description && <p className="mt-3 max-w-3xl text-xs leading-6 text-white/60">{family.description}</p>}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-white/75">
              <ShieldCheck className="h-4 w-4 text-gold-light" />
              <span>{level ? `当前权限：${level === "OWNER" ? "所有者" : level === "ADMIN" ? "管理员" : level === "EDITOR" ? "编辑者" : "浏览者"}` : "公开访客 · 只读"}</span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-6 text-white/85">
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-gold-light" /><div><div className="font-serif text-xl text-gold-light">{family._count.members}</div><div className="text-[10px] text-white/55">在册人物</div></div></div>
            <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-gold-light" /><div><div className="font-serif text-xl text-gold-light">{family._count.relationships}</div><div className="text-[10px] text-white/55">登记关系</div></div></div>
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gold-light" /><div><div className="font-serif text-xl text-gold-light">{family._count.documents}</div><div className="text-[10px] text-white/55">关联档案</div></div></div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1.5 shadow-paper">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${tab === t.key ? "bg-navy text-white" : "text-ink-soft hover:bg-cream"}`}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>

        {!canWrite && (
          <div className="mb-4"><Notice data={{ kind: "warning", title: "只读浏览模式", lines: ["你没有该族谱的编辑权限，写操作按钮已隐藏；服务端也会独立校验权限，不会因前端隐藏而失效。"] }} /></div>
        )}

        {tab === "graph" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold text-ink">家族关系图谱</h2>
              <p className="text-[11px] text-graphite">四种视图 · 按视野局部加载 · 仅已核实关系参与称谓计算</p>
            </div>
            <GenealogyGraph familyId={familyId} hasAccess={hasAccess} />
          </div>
        )}
        {tab === "stats" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold text-ink">家族统计</h2>
              <p className="text-[11px] text-graphite">仅聚合数字 · 不展示任何人物姓名与联系方式</p>
            </div>
            <FamilyStatsPanel familyId={familyId} />
          </div>
        )}
        {tab === "people" && <PersonPanel familyId={familyId} familySurname={family.surnameText} canWrite={canWrite} onChanged={refresh} />}
        {tab === "relations" && <RelationPanel familyId={familyId} canWrite={canWrite} onChanged={refresh} />}
        {tab === "generations" && <GenerationPanel familyId={familyId} canWrite={canWrite} onChanged={refresh} />}
        {tab === "archive" && <ArchivePanel familyId={familyId} canWrite={canWrite} canAdmin={canManage} />}
        {tab === "io" && <ImportExportPanel familyId={familyId} canWrite={canWrite} onChanged={refresh} />}
        {tab === "versions" && <VersionPanel familyId={familyId} canWrite={canWrite} isOwner={isOwner} onChanged={refresh} />}
        {tab === "collaborators" && <CollaboratorPanel familyId={familyId} canManage={canManage} isOwner={isOwner} />}
        {tab === "settings" && <SettingsPanel family={family} onChanged={refresh} />}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned, ScrollText, Landmark, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { MigrationMap } from "@/components/migration-map";
import { Badge, Card, SectionTitle } from "@/components/ui/primitives";
import { evidenceLabel, reviewLabel, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "历史寻根与迁徙地图",
  description: "姓氏发源地、古今地名对照、有来源的宏观迁徙记录与古籍资料查询。",
};

export default async function RootsPage() {
  const [places, sources, migrations, figures] = await Promise.all([
    prisma.historicalPlace.findMany({
      where: { deletedAt: null },
      orderBy: { historicalName: "asc" },
      include: { aliases: true },
      take: 60,
    }),
    prisma.historicalSource.findMany({ where: { deletedAt: null }, orderBy: { title: "asc" } }),
    prisma.migrationRecord.findMany({
      where: { deletedAt: null }, orderBy: { startYear: "asc" },
      include: { fromPlace: true, toPlace: true, source: true },
    }),
    prisma.historicalFigure.count({ where: { deletedAt: null } }),
  ]);

  return (
    <div className="paper-bg">
      <section className="ink-bg border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
          <div className="text-xs tracking-[0.3em] text-gold-light">HISTORICAL ROOTS</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white md:text-4xl">历史寻根 · 祖籍与迁徙</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
            从古代地名到现代行政区划，从郡望地望到有史料依据的人口迁徙。所有地点保存历史名称、现代名称、坐标与来源；
            明确区分「史料明确记载」「地方传说」「研究推测」，不凭空生成祖先迁徙路线。
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-12 md:px-6">
        <section id="migrations">
          <SectionTitle eyebrow="MIGRATION MAP" title="历史迁徙地图" description="底图采用国内合规的官方行政区划数据；点击路线可查看时代、原因、史料来源与可信程度。" />
          <MigrationMap />
        </section>

        <section>
          <SectionTitle eyebrow="MIGRATION RECORDS" title="有来源的迁徙记录" description="以下均为宏观人口流动记录，不代表任何具体家族的祖先路线。" />
          <div className="grid gap-3 md:grid-cols-2">
            {migrations.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-base text-navy">{m.fromPlace?.historicalName ?? "—"}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gold" />
                  <span className="font-serif text-base text-navy">{m.toPlace?.historicalName ?? "—"}</span>
                  <Badge tone={m.evidenceLevel === "DOCUMENTED" ? "jade" : "gold"}>{evidenceLabel(m.evidenceLevel)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-graphite">
                  {m.dynasty && <span>{m.dynasty}</span>}
                  {m.startYear && <span>约 {m.startYear} 年起</span>}
                  {m.reason && <span>· {m.reason}</span>}
                  {m.source && <span>· 来源：{m.source.title}</span>}
                </div>
                {m.narrative && <p className="mt-2 text-xs leading-6 text-ink-soft">{truncate(m.narrative, 160)}</p>}
              </Card>
            ))}
          </div>
        </section>

        <section id="places">
          <SectionTitle eyebrow="HISTORICAL PLACES" title="古今地名对照" description="坐标为现代地名治所近似位置，仅供地图示意；历史行政区划范围随时代变化。" />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-cream/70 text-[11px] uppercase tracking-wider text-graphite">
                  <tr>
                    <th className="px-4 py-3 font-medium">历史名称</th>
                    <th className="px-4 py-3 font-medium">现代对应</th>
                    <th className="px-4 py-3 font-medium">别名</th>
                    <th className="px-4 py-3 font-medium">近似坐标</th>
                    <th className="px-4 py-3 font-medium">审核状态</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                      <td className="px-4 py-3 font-serif text-ink">{p.historicalName}</td>
                      <td className="px-4 py-3 text-xs text-graphite">{p.modernName ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-graphite">{p.aliases.length ? p.aliases.map((a) => a.alias).join("、") : "—"}</td>
                      <td className="px-4 py-3 text-xs text-graphite">{p.longitude && p.latitude ? `${Number(p.longitude).toFixed(2)}, ${Number(p.latitude).toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3"><Badge tone={p.reviewStatus === "APPROVED" ? "jade" : "neutral"}>{reviewLabel(p.reviewStatus)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section id="sources">
          <SectionTitle eyebrow="SOURCES" title="史料与古籍" description="资料来源优先级：正规出版历史文献 → 地方志 → 可核实档案 → 学术研究 → 有明确来源的族谱 → 其他民间资料。" />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif text-sm font-semibold text-ink">{s.title}</h3>
                  <Badge tone="gold">{s.credibility === "PRIMARY" ? "原始文献" : s.credibility === "SECONDARY" ? "二级文献" : "工具书"}</Badge>
                </div>
                <div className="mt-1.5 text-[11px] text-gold">{s.author ?? "作者待补录"}{s.edition ? ` · ${s.edition}` : ""}</div>
                {s.notes && <p className="mt-2 text-xs leading-5 text-graphite">{truncate(s.notes, 100)}</p>}
                <div className="mt-3 border-t border-line/70 pt-2 text-[11px] text-graphite">{reviewLabel(s.reviewStatus)} · 卷次/页码待人工补录</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="DATA POLICY" title="数据处理原则" />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: MapPinned, title: "地点与坐标", desc: "历史名称、现代名称、所属行政区划、坐标与来源分开保存；坐标标记为近似示意值。" },
              { icon: ScrollText, title: "来源与引用", desc: "每条迁徙记录挂接来源、卷次、原始引用与审核状态；无来源不展示路线。" },
              { icon: Landmark, title: "人物活动地点", desc: `已收录 ${figures} 位历史人物，人物与活动地点分表管理，不因同名与用户族谱成员合并。` },
            ].map((x) => (
              <Card key={x.title} className="p-5">
                <x.icon className="h-6 w-6 text-gold" strokeWidth={1.6} />
                <h3 className="mt-4 font-serif text-base font-semibold text-ink">{x.title}</h3>
                <p className="mt-2 text-xs leading-6 text-graphite">{x.desc}</p>
              </Card>
            ))}
          </div>
          <div className="mt-5 text-center text-xs text-graphite">
            需要录入自己家族的祖籍与迁徙？<Link href="/families/new" className="text-navy underline">创建族谱</Link> 后可在家族档案中标注来源。
          </div>
        </section>
      </div>
    </div>
  );
}

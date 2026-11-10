import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, MapPin, ScrollText, ShieldCheck, Users, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Divider, EmptyState, SectionTitle } from "@/components/ui/primitives";
import { evidenceLabel, reviewLabel, truncate, formatYear } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)}姓 · 姓氏起源与郡望堂号` };
}

export default async function SurnameDetailPage({ params }: Props) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  const surname = await prisma.surname.findFirst({
    where: {
      deletedAt: null,
      OR: [{ name: decoded }, { traditional: decoded }, { variants: { some: { variant: decoded } } }],
    },
    include: {
      origins: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { source: true } },
      variants: true,
      hallNames: { where: { deletedAt: null } },
      commanderies: { where: { deletedAt: null } },
      figures: { where: { deletedAt: null }, orderBy: { birthYear: "asc" }, take: 40 },
      events: { where: { deletedAt: null }, orderBy: { yearValue: "asc" } },
      migrations: { where: { deletedAt: null }, include: { fromPlace: true, toPlace: true, source: true } },
    },
  });
  if (!surname) notFound();

  const citations = await prisma.sourceCitation.findMany({
    where: { entityType: "surname_origin", entityId: surname.id },
    include: { source: true },
    take: 20,
  });

  const tone = (level: string) => level === "TRADITION" ? "red" : level === "INFERRED" ? "gold" : level === "DOCUMENTED" ? "jade" : "neutral";

  return (
    <div className="paper-bg">
      {/* Header */}
      <section className="ink-bg border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
          <Link href="/surnames" className="mb-6 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-gold-light"><ArrowLeft className="h-3.5 w-3.5" /> 返回百家姓</Link>
          <div className="flex flex-wrap items-end gap-8">
            <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-gold/50 bg-white/5 font-serif text-7xl text-gold-light">{surname.name}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-3xl font-semibold text-white">{surname.name}姓</h1>
                <Badge tone="gold">{surname.category === "COMPOUND" ? "复姓" : "单姓"}</Badge>
                {surname.popularityRank && <Badge tone="navy">《百家姓》第 {surname.popularityRank} 位</Badge>}
              </div>
              <div className="mt-2 text-sm text-white/60">
                拼音 {surname.pinyin}
                {surname.traditional ? ` · 繁体 ${surname.traditional}` : ""}
                {surname.variants.length ? ` · 异体 ${surname.variants.map((v) => v.variant).join("、")}` : ""}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={tone(surname.credibility)}>{evidenceLabel(surname.credibility)}</Badge>
                <Badge tone={surname.reviewStatus === "APPROVED" ? "jade" : "neutral"}>基础条目：{reviewLabel(surname.reviewStatus)}</Badge>
              </div>
            </div>
          </div>
          {surname.originSummary && <p className="mt-7 max-w-3xl text-sm leading-7 text-white/70">{surname.originSummary}</p>}
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:px-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {/* 起源 */}
          <section>
            <SectionTitle eyebrow="ORIGINS" title="姓氏起源与得姓历史" description="不同说法分别列出，按史料可信程度分级；传说与推测不会合并为确定史实。" />
            {surname.origins.length === 0 ? (
              <EmptyState title="起源资料待录入" description="平台不会生成未经核实的姓氏起源；资料由编辑录入并经审核后展示。" />
            ) : (
              <div className="space-y-4">
                {surname.origins.map((o, i) => (
                  <Card key={o.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-gold" />
                        <h3 className="font-serif text-base font-semibold text-ink">{o.title}</h3>
                        {o.era && <span className="text-xs text-graphite">{o.era}</span>}
                      </div>
                      <div className="flex gap-2">
                        <Badge tone={tone(o.evidenceLevel)}>{evidenceLabel(o.evidenceLevel)}</Badge>
                        <Badge tone={o.reviewStatus === "APPROVED" ? "jade" : "neutral"}>{reviewLabel(o.reviewStatus)}</Badge>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <p className="text-sm leading-7 text-ink-soft">{o.content}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 text-[11px] text-graphite">
                        <ScrollText className="h-3.5 w-3.5" />
                        {o.source ? <span>来源：{o.source.title}{o.source.author ? ` · ${o.source.author}` : ""}</span> : <span>来源待补录</span>}
                        <span>· 卷次/页码待人工核对</span>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* 郡望堂号 */}
          <section>
            <SectionTitle eyebrow="COMMANDERIES & HALLS" title="郡望与堂号" description="郡望为历史上较显著的地域性家族，堂号多为祠堂或支系标识；二者都不能作为判断血缘关系的依据。" />
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-jade" /><h3 className="font-serif text-base font-semibold">郡望</h3></div></CardHeader>
                <CardBody>
                  {surname.commanderies.length ? (
                    <div className="flex flex-wrap gap-2">
                      {surname.commanderies.map((c) => <Badge key={c.id} tone="jade">{c.name}</Badge>)}
                    </div>
                  ) : <p className="text-xs text-graphite">暂无已录入的郡望资料。</p>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gold" /><h3 className="font-serif text-base font-semibold">堂号</h3></div></CardHeader>
                <CardBody>
                  {surname.hallNames.length ? (
                    <div className="space-y-2">
                      {surname.hallNames.map((h) => (
                        <div key={h.id}>
                          <Badge tone="gold">{h.name}</Badge>
                          {h.origin && <p className="mt-1 text-[11px] leading-5 text-graphite">{h.origin}</p>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-graphite">暂无已录入的堂号资料。</p>}
                </CardBody>
              </Card>
            </div>
          </section>

          {/* 历史人物 */}
          <section>
            <SectionTitle eyebrow="HISTORICAL FIGURES" title="历史人物" description="历史人物与用户族谱成员分库管理，不因姓名相同自动合并。" />
            {surname.figures.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {surname.figures.map((f) => (
                  <Card key={f.id} className="p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-lg text-ink">{f.name}</span>
                      <span className="text-[11px] text-gold">{f.dynasty || "年代不详"}</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-graphite">{truncate(f.biography ?? "", 90)}</p>
                    <div className="mt-3 flex gap-1.5"><Badge tone="neutral">{reviewLabel(f.reviewStatus)}</Badge></div>
                  </Card>
                ))}
              </div>
            ) : <EmptyState title="历史人物待录入" description="相关人物资料将持续补充，并标注文献来源。" />}
          </section>

          {/* 时间轴 */}
          {surname.events.length > 0 && (
            <section>
              <SectionTitle eyebrow="TIMELINE" title="相关历史事件" />
              <div className="relative space-y-4 border-l border-gold/50 pl-6">
                {surname.events.map((e) => (
                  <div key={e.id} className="relative">
                    <div className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-gold bg-cream" />
                    <div className="text-xs font-medium text-gold">{e.yearText || formatYear(e.yearValue)}{e.dynasty ? ` · ${e.dynasty}` : ""}</div>
                    <div className="mt-1 font-serif text-sm text-ink">{e.title}</div>
                    {e.description && <p className="mt-1 text-xs text-graphite">{e.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 迁徙 */}
          {surname.migrations.length > 0 && (
            <section>
              <SectionTitle eyebrow="MIGRATION" title="相关迁徙记录" description="只有挂接史料来源的记录才会在此展示。" />
              <div className="space-y-2">
                {surname.migrations.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm">
                    <span className="text-navy">{m.fromPlace?.historicalName ?? "—"}</span>
                    <span className="text-gold">→</span>
                    <span className="text-navy">{m.toPlace?.historicalName ?? "—"}</span>
                    <Badge tone={tone(m.evidenceLevel)}>{evidenceLabel(m.evidenceLevel)}</Badge>
                    {m.source && <span className="text-[11px] text-graphite">来源：{m.source.title}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Info className="h-4 w-4 text-gold" /><h3 className="font-serif text-base font-semibold">资料可信度说明</h3></div></CardHeader>
            <CardBody className="space-y-3 text-xs leading-6 text-graphite">
              <p><strong className="text-ink">史料明确记载：</strong>正史、姓氏专著、地方志等可查证记载。</p>
              <p><strong className="text-ink">地方传说：</strong>流传于族谱或地方口碑的族源叙述，早期世系不可视为信史。</p>
              <p><strong className="text-ink">研究推测：</strong>学界尚有讨论的推断，不作为确定结论。</p>
              <Divider className="my-3" />
              <p>起源条目缺少可核验的卷次、页码与原文引用，因此统一标记为「待审核」。基础字典项（字形、读音、《百家姓》序位）已核定。</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center gap-2"><Users className="h-4 w-4 text-jade" /><h3 className="font-serif text-base font-semibold">字形与异体</h3></div></CardHeader>
            <CardBody>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-graphite">简体 / 本字</span><span className="font-serif text-lg text-ink">{surname.name}</span></div>
                <div className="flex justify-between"><span className="text-graphite">繁体</span><span className="font-serif text-lg text-ink">{surname.traditional ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-graphite">异体 / 别名</span><span className="text-ink">{surname.variants.length ? surname.variants.map((v) => v.variant).join("、") : "—"}</span></div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-navy" /><h3 className="font-serif text-base font-semibold">引用文献</h3></div></CardHeader>
            <CardBody>
              {citations.length ? (
                <ul className="space-y-2 text-xs">
                  {citations.map((c) => (
                    <li key={c.id} className="rounded-md bg-cream px-3 py-2">
                      <div className="font-medium text-ink">{c.source.title}</div>
                      <div className="mt-0.5 text-[11px] text-graphite">{c.source.author ?? "作者待补录"}{c.pageOrVolume ? ` · ${c.pageOrVolume}` : ""}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-graphite">暂无引用记录。</p>}
            </CardBody>
          </Card>

          <Card className="border-gold/40 bg-[#faf6ec]">
            <CardBody className="text-xs leading-6 text-graphite">
              <strong className="text-ink">同姓不代表同宗。</strong>
              姓氏知识库是公共历史资料；你的家族关系数据独立存储，平台不会据此自动认定血缘或合并家族。
              <div className="mt-3"><Link href="/families/new" className="text-navy underline">创建我的家族族谱 →</Link></div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

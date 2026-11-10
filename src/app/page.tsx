import Link from "next/link";
import { ArrowRight, BookOpen, MapPinned, Network, Users, ShieldCheck, Database, GitBranch, ScrollText, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { HeroSearch } from "@/components/hero-search";
import { Badge, Card, CardBody, SectionTitle, Divider } from "@/components/ui/primitives";
import { evidenceLabel, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FEATURES = [
  { href: "/surnames", icon: BookOpen, title: "中华百家姓", desc: "姓氏起源、郡望堂号、异体字与历史人物，每条资料标注来源与可信度。", tone: "text-gold" },
  { href: "/roots", icon: MapPinned, title: "历史寻根", desc: "古今地名对照、宏观人口迁徙、古籍出处；传说与推测单独标注。", tone: "text-jade" },
  { href: "/families/new", icon: Network, title: "创建家族族谱", desc: "录入真实人物与关系，自动生成四种视图的家族关系图谱。", tone: "text-navy" },
  { href: "/community", icon: Users, title: "宗亲交流", desc: "寻亲大厅、家族协作与分支关联申请；关联须双方确认与证据核验。", tone: "text-cinnabar" },
];

const PRINCIPLES = [
  { icon: Database, title: "史料与族谱严格分离", desc: "历史人物与用户家族成员不因同名自动合并；姓氏知识库由独立来源表管理。" },
  { icon: GitBranch, title: "同姓不等于同宗", desc: "系统不会按姓氏自动认定血缘或合并家族，关系必须明确类型、方向与核实状态。" },
  { icon: ShieldCheck, title: "隐私优先", desc: "新建族谱默认私有，在世人物默认严格保护，搜索与图谱接口均做权限过滤。" },
  { icon: ScrollText, title: "不编造历史", desc: "无来源不生成迁徙路线；传说标为传说，待审核资料不显示为已审定史实。" },
];

export default async function HomePage() {
  const [surnameCount, figureCount, placeCount, migrationCount, sourceCount, familyCount] = await Promise.all([
    prisma.surname.count({ where: { deletedAt: null } }),
    prisma.historicalFigure.count({ where: { deletedAt: null } }),
    prisma.historicalPlace.count({ where: { deletedAt: null } }),
    prisma.migrationRecord.count({ where: { deletedAt: null } }),
    prisma.historicalSource.count({ where: { deletedAt: null } }),
    prisma.family.count({ where: { visibility: "PUBLIC", deletedAt: null } }),
  ]);

  const [popular, origins, figures, families, seekPosts, migrations] = await Promise.all([
    prisma.surname.findMany({
      where: { deletedAt: null, popularityRank: { not: null } },
      orderBy: { popularityRank: "asc" },
      take: 12,
      select: { name: true, pinyin: true, traditional: true, popularityRank: true, originSummary: true, credibility: true },
    }),
    prisma.surnameOrigin.findMany({
      where: { deletedAt: null, reviewStatus: { in: ["PENDING", "APPROVED"] } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { surname: { select: { name: true, pinyin: true } }, source: { select: { title: true } } },
    }),
    prisma.historicalFigure.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { surname: { select: { name: true } } },
    }),
    prisma.family.findMany({
      where: { visibility: "PUBLIC", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, name: true, surnameText: true, ancestralHome: true, hallName: true, isDemo: true, description: true, _count: { select: { members: true } } },
    }),
    prisma.post.findMany({
      where: { type: "SEEK_RELATIVE", status: "PUBLISHED", deletedAt: null, visibility: "PUBLIC" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, content: true, createdAt: true, author: { select: { profile: { select: { displayName: true } } } } },
    }),
    prisma.migrationRecord.findMany({
      where: { deletedAt: null },
      orderBy: { startYear: "asc" },
      take: 4,
      include: { fromPlace: { select: { historicalName: true } }, toPlace: { select: { historicalName: true } }, source: { select: { title: true } } },
    }),
  ]);

  const stats = [
    { label: "收录姓氏", value: surnameCount },
    { label: "历史人物", value: figureCount },
    { label: "古今地名", value: placeCount },
    { label: "史料来源", value: sourceCount },
    { label: "迁徙记录", value: migrationCount },
    { label: "公开族谱", value: familyCount },
  ];

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="ink-bg relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute -right-16 -top-20 select-none font-serif text-[380px] leading-none text-white/[0.035]">姓</div>
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <div className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/40 px-3 py-1.5 text-[11px] tracking-[0.18em] text-gold-light">
              <Sparkles className="h-3.5 w-3.5" /> 中华姓氏文化 · 数字档案馆
            </div>
            <h1 className="font-serif text-4xl font-semibold leading-[1.35] tracking-wide text-white md:text-6xl">
              寻一姓之源，<br />
              <span className="text-gold-light">续一脉之谱</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/65 md:text-base">
              从姓氏起源、郡望堂号到祖籍迁徙；从真实家族人物、亲属关系到族谱档案协作。
              以史料为据，以隐私为界，构建可持续传承的中华家族记忆。
            </p>
          </div>
          <div className="mt-9 animate-fade-up delay-1"><HeroSearch /></div>
          <div className="mt-14 grid max-w-3xl grid-cols-3 gap-4 border-t border-white/15 pt-7 md:grid-cols-6 animate-fade-up delay-2">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-serif text-2xl text-gold-light">{s.value}</div>
                <div className="mt-1 text-[11px] text-white/55">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 功能入口 ---------------- */}
      <section className="paper-bg border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Link key={f.href} href={f.href} className={`card-hover animate-fade-up delay-${i + 1} group rounded-xl border border-line bg-white p-6 shadow-paper`}>
                <f.icon className={`h-7 w-7 ${f.tone}`} strokeWidth={1.5} />
                <h3 className="mt-5 font-serif text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-graphite">{f.desc}</p>
                <div className="mt-5 flex items-center gap-1 text-xs font-medium text-gold opacity-0 transition-opacity group-hover:opacity-100">
                  进入模块 <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 热门姓氏 ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <SectionTitle
          eyebrow="SURNAME RANKING"
          title="百家姓 · 姓氏检索"
          description="排序取自宋代《百家姓》序位（非现代人口排名），点击姓氏查看起源、郡望、堂号与文献出处。"
          action={<Link href="/surnames" className="flex items-center gap-1 text-sm text-navy hover:text-gold">查看全部 <ArrowRight className="h-4 w-4" /></Link>}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {popular.map((s) => (
            <Link key={s.name} href={`/surnames/${encodeURIComponent(s.name)}`} className="card-hover group rounded-xl border border-line bg-white p-4 text-center shadow-paper">
              <div className="font-serif text-4xl font-semibold text-navy transition-colors group-hover:text-gold">{s.name}</div>
              <div className="mt-1 text-[11px] tracking-wide text-graphite">{s.pinyin}</div>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <Badge tone={s.credibility === "DOCUMENTED" ? "jade" : "gold"}>{evidenceLabel(s.credibility)}</Badge>
              </div>
              <div className="mt-2 text-[10px] text-graphite/70">《百家姓》第 {s.popularityRank} 位</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- 姓氏文化 + 历史人物 ---------------- */}
      <section className="border-y border-line bg-white/50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 py-16 md:px-6 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <SectionTitle eyebrow="CULTURAL ARCHIVE" title="姓氏文化 · 有据可查" description="每条起源都关联史料来源，并区分「史料明确记载」「地方传说」「研究推测」。" />
            <div className="space-y-3">
              {origins.map((o) => (
                <Link key={o.id} href={`/surnames/${encodeURIComponent(o.surname.name)}`} className="card-hover block rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-lg text-navy">{o.surname.name}</span>
                      <span className="text-sm font-medium text-ink">{o.title}</span>
                    </div>
                    <Badge tone={o.evidenceLevel === "TRADITION" ? "red" : o.evidenceLevel === "INFERRED" ? "gold" : "jade"}>
                      {evidenceLabel(o.evidenceLevel)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-graphite">{truncate(o.content, 110)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-graphite/80">
                    {o.source?.title && <span>出处：{o.source.title}</span>}
                    <Badge tone="neutral">待审核</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle eyebrow="HISTORICAL FIGURES" title="历史人物" description="历史人物条目与用户家族成员分库管理，绝不因同名自动关联。" />
            <div className="grid grid-cols-2 gap-3">
              {figures.map((f) => (
                <div key={f.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-lg text-ink">{f.name}</span>
                    {f.surname && <span className="text-[11px] text-graphite">{f.surname.name}姓</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-gold">{f.dynasty || "年代不详"}</div>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-graphite">{truncate(f.biography ?? "", 52)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 公开族谱 + 寻亲 ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionTitle
              eyebrow="FAMILY TREES"
              title="最新公开族谱"
              description="仅展示由家族成员主动授权公开的族谱；私有族谱不会出现在任何公开列表或搜索结果中。"
              action={<Link href="/families" className="flex items-center gap-1 text-sm text-navy hover:text-gold">族谱中心 <ArrowRight className="h-4 w-4" /></Link>}
            />
            <div className="space-y-3">
              {families.length === 0 && <Card><CardBody className="text-sm text-graphite">暂无公开族谱。</CardBody></Card>}
              {families.map((f) => (
                <Link key={f.id} href={`/families/${f.id}`} className="card-hover flex items-center gap-4 rounded-xl border border-line bg-white p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-navy font-serif text-2xl text-gold-light">{f.surnameText}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif text-base font-semibold text-ink">{f.name}</h3>
                      {f.isDemo && <Badge tone="gold">演示数据</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-graphite">{truncate(f.description ?? "", 90)}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-graphite">
                      {f.hallName && <span>堂号：{f.hallName}</span>}
                      {f.ancestralHome && <span>祖籍：{f.ancestralHome}</span>}
                      <span>{f._count.members} 位成员</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gold" />
                </Link>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle eyebrow="CLAN COMMUNITY" title="寻亲信息" description="同姓不代表同宗；任何宗亲关联都需双方确认与证据核验。" />
            <div className="space-y-3">
              {seekPosts.length === 0 && <Card><CardBody className="text-sm text-graphite">暂无寻亲信息。</CardBody></Card>}
              {seekPosts.map((p) => (
                <Link key={p.id} href={`/community#post-${p.id}`} className="card-hover block rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center gap-2"><Badge tone="red">寻亲</Badge><span className="text-[11px] text-graphite">{p.author.profile?.displayName ?? "用户"}</span></div>
                  <h3 className="mt-2 font-serif text-sm font-semibold text-ink">{p.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-graphite">{truncate(p.content, 80)}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 迁徙地图入口 ---------------- */}
      <section className="border-y border-line bg-white/50">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-2">
          <div>
            <SectionTitle eyebrow="MIGRATION MAP" title="祖籍与迁徙地图" description="展示有史料依据的宏观人口迁徙，起终点、时代、原因、来源与可信程度均可追溯。" />
            <div className="space-y-2">
              {migrations.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-[13px]">
                  <span className="font-medium text-navy">{m.fromPlace?.historicalName ?? "—"}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gold" />
                  <span className="font-medium text-navy">{m.toPlace?.historicalName ?? "—"}</span>
                  <span className="text-graphite">{m.dynasty}</span>
                  <Badge tone="jade">{evidenceLabel(m.evidenceLevel)}</Badge>
                  {m.source?.title && <span className="text-[11px] text-graphite/70">来源：{m.source.title}</span>}
                </div>
              ))}
            </div>
            <Link href="/roots#migrations" className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-navy px-4 py-2.5 text-sm text-white hover:bg-navy-light">
              打开迁徙地图 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-[#eef1ec] p-4 shadow-paper">
            <MigrationSchematic />
            <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-1.5 text-[11px] text-graphite backdrop-blur">
              抽象关系示意图（非地图）· 正式地理底图见「历史寻根」
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 平台原则 ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <SectionTitle eyebrow="OUR PRINCIPLES" title="严谨，是这个平台的底线" description="族谱承载真实家庭信息，任何便利都不能以牺牲事实与隐私为代价。" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-xl border border-line bg-white p-5 shadow-paper">
              <p.icon className="h-6 w-6 text-gold" strokeWidth={1.6} />
              <h3 className="mt-4 font-serif text-base font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-graphite">{p.desc}</p>
            </div>
          ))}
        </div>
        <Divider />
        <div className="flex flex-col items-center gap-4 text-center">
          <h3 className="font-serif text-2xl text-ink">从自己的姓氏开始，记录真实的一家人</h3>
          <p className="max-w-xl text-sm leading-6 text-graphite">注册后即可创建私有族谱、添加人物与关系、生成家族关系图谱、管理字辈与档案，并随时导出备份。</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/register" className="rounded-md bg-gold px-6 py-3 text-sm font-medium text-white hover:brightness-110">免费注册</Link>
            <Link href="/guide" className="rounded-md border border-line bg-white px-6 py-3 text-sm text-ink hover:border-gold">阅读使用说明</Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** 抽象的关系网络示意图：不含任何地理轮廓，避免被误认为地图。 */
function MigrationSchematic() {
  const nodes = [
    { x: 280, y: 90, label: "中原", sub: "起点" },
    { x: 400, y: 190, label: "江南", sub: "永嘉南渡" },
    { x: 160, y: 200, label: "四川", sub: "湖广填四川" },
    { x: 430, y: 295, label: "关东", sub: "闯关东" },
    { x: 120, y: 300, label: "湖广", sub: "迁出地" },
  ];
  const links = [
    { from: 0, to: 1, color: "#b08d57" },
    { from: 0, to: 2, color: "#3e6b6b" },
    { from: 4, to: 2, color: "#3e6b6b" },
    { from: 0, to: 3, color: "#1b2a41" },
  ];
  return (
    <svg viewBox="0 0 560 380" className="h-auto w-full" role="img" aria-label="历史人口迁徙抽象关系示意图，非地图">
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#c8d2c6" />
        </pattern>
      </defs>
      <rect width="560" height="380" fill="#eef1ec" />
      <rect width="560" height="380" fill="url(#dots)" />
      {links.map((l, i) => {
        const a = nodes[l.from]; const b = nodes[l.to];
        const mx = (a.x + b.x) / 2 + (i % 2 === 0 ? 26 : -26);
        return (
          <g key={i}>
            <path d={`M${a.x} ${a.y} Q${mx} ${(a.y + b.y) / 2} ${b.x} ${b.y}`} stroke={l.color} strokeWidth="2" fill="none" strokeDasharray="6 5" opacity=".75" />
            <circle cx={b.x} cy={b.y} r="3" fill={l.color} />
          </g>
        );
      })}
      {nodes.map((n, i) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="22" fill="#ffffff" stroke={i === 0 ? "#b08d57" : "#c3cec2"} strokeWidth="1.5" />
          <circle cx={n.x} cy={n.y} r="5" fill={i === 0 ? "#a63d2f" : "#1b2a41"} />
          <text x={n.x} y={n.y + 39} textAnchor="middle" fontSize="12" fill="#1b2a41" fontWeight="600">{n.label}</text>
          <text x={n.x} y={n.y + 54} textAnchor="middle" fontSize="9" fill="#7b837c">{n.sub}</text>
        </g>
      ))}
      <text x="20" y="28" fontSize="10" fill="#8a938b">史料来源 · 可信程度 · 迁徙时代　三者缺一不展示</text>
    </svg>
  );
}

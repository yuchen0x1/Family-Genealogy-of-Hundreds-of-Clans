import Link from "next/link";

const GROUPS = [
  {
    title: "姓氏文化",
    links: [
      { href: "/surnames", label: "中华百家姓" },
      { href: "/roots", label: "历史寻根" },
      { href: "/roots#migrations", label: "迁徙记录" },
      { href: "/roots#places", label: "古今地名" },
    ],
  },
  {
    title: "家族族谱",
    links: [
      { href: "/families", label: "公开族谱" },
      { href: "/families/new", label: "创建族谱" },
      { href: "/families?mine=1", label: "我的族谱" },
      { href: "/guide#gedcom", label: "导入与导出" },
    ],
  },
  {
    title: "宗亲社区",
    links: [
      { href: "/community", label: "寻亲大厅" },
      { href: "/community#discussions", label: "家族讨论" },
      { href: "/guide#privacy", label: "隐私与授权" },
    ],
  },
  {
    title: "关于平台",
    links: [
      { href: "/guide", label: "使用说明" },
      { href: "/legal/privacy", label: "隐私政策" },
      { href: "/legal/terms", label: "用户协议" },
      { href: "/guide#sources", label: "资料来源说明" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-white/60">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-gold/60 bg-navy font-serif text-xl text-gold-light">尋</div>
              <div>
                <div className="font-serif text-base font-semibold tracking-[0.16em]">中华寻根 · 百家族谱</div>
                <div className="text-[10px] tracking-[0.28em] text-gold">ROOTS OF CHINA</div>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-graphite">
              以史料为依据整理中华姓氏文化，以隐私为前提记录真实家族关系。同姓不代表同宗，未经核实的关系不会被系统推断为血缘。
            </p>
            <p className="mt-3 text-[11px] text-graphite/80">
              本站历史资料均标注来源与可信度；标注「演示数据」的内容为功能示例，不代表真实家族或历史结论。
            </p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-3 text-xs font-semibold tracking-wider text-ink">{g.title}</h3>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-xs text-graphite transition-colors hover:text-gold">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11px] text-graphite">
          <span>© {new Date().getFullYear()} 中华寻根 · 百家族谱　项目演示版本</span>
          <span>历史资料持续录入与审核中 · 私人族谱默认不公开 · 在世人物信息默认保护</span>
        </div>
      </div>
    </footer>
  );
}

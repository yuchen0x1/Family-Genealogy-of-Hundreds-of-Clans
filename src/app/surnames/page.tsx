import type { Metadata } from "next";
import { SurnameBrowser } from "@/components/surname-browser";
import { SectionTitle } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "中华百家姓",
  description: "按《百家姓》序位检索中华姓氏起源、郡望、堂号、异体字与历史人物，每条资料标注来源与可信程度。",
};

export default async function SurnamesPage() {
  const [total, compound, sources] = await Promise.all([
    prisma.surname.count({ where: { deletedAt: null } }),
    prisma.surname.count({ where: { deletedAt: null, category: "COMPOUND" } }),
    prisma.historicalSource.count({ where: { deletedAt: null } }),
  ]);

  return (
    <div className="paper-bg">
      <section className="ink-bg border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
          <div className="text-xs tracking-[0.3em] text-gold-light">THE HUNDRED SURNAMES</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white md:text-4xl">中华百家姓 · 姓氏知识库</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
            姓氏起源、得姓历史、郡望堂号、异体字、历史人物与相关古籍。每条资料独立标注来源、可信程度与审核状态；
            传说不会写成史实，待审核条目不会标记为已审定。
          </p>
          <div className="mt-7 flex flex-wrap gap-6 text-white/80">
            <div><div className="font-serif text-2xl text-gold-light">{total}</div><div className="text-[11px] text-white/55">已收录姓氏</div></div>
            <div><div className="font-serif text-2xl text-gold-light">{compound}</div><div className="text-[11px] text-white/55">复姓</div></div>
            <div><div className="font-serif text-2xl text-gold-light">{sources}</div><div className="text-[11px] text-white/55">史料来源</div></div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <SectionTitle eyebrow="BROWSE" title="按姓氏检索" description="支持中文姓氏、拼音、拼音首字母、繁体与异体字；结果按《百家姓》序位排列。" />
        <SurnameBrowser />
      </div>
    </div>
  );
}

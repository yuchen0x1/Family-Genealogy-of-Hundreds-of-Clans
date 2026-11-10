import type { Metadata } from "next";
import Link from "next/link";
import { FamilyList } from "@/components/family/family-list";
import { SectionTitle } from "@/components/ui/primitives";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "族谱中心",
  description: "创建与管理个人家族族谱，录入人物、关系、字辈与分支，生成可交互的家族关系图谱。",
};

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const sp = await searchParams;
  const [publicCount, demoCount] = await Promise.all([
    prisma.family.count({ where: { visibility: "PUBLIC", deletedAt: null } }),
    prisma.family.count({ where: { visibility: "PUBLIC", deletedAt: null, isDemo: true } }),
  ]);

  return (
    <div className="paper-bg">
      <section className="ink-bg border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-6">
          <div className="text-xs tracking-[0.3em] text-gold-light">FAMILY GENEALOGY</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white md:text-4xl">族谱中心 · 我的家族</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
            创建多份独立族谱，登记人物与已核实的亲属关系，管理字辈、分支与家族档案。
            新建族谱默认私有，在世人物信息默认严格保护；只有主动公开的内容才会被检索到。
          </p>
          <div className="mt-7 flex flex-wrap gap-6 text-white/80">
            <div><div className="font-serif text-2xl text-gold-light">{publicCount}</div><div className="text-[11px] text-white/55">公开族谱</div></div>
            <div><div className="font-serif text-2xl text-gold-light">{demoCount}</div><div className="text-[11px] text-white/55">演示族谱（非真实家族）</div></div>
            <div className="flex items-end"><Link href="/roots" className="text-xs text-gold-light underline underline-offset-4 hover:text-white">了解历史寻根 →</Link></div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <SectionTitle eyebrow="BROWSE" title="浏览族谱" description="公开族谱由用户主动发布；私有族谱仅对本人与受邀协作者可见。" />
        <FamilyList initialMine={sp.mine === "1"} />
      </div>
    </div>
  );
}

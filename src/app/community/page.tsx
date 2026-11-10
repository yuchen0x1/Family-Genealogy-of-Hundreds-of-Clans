import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CommunityHub } from "@/components/community/community-hub";
import { SectionTitle } from "@/components/ui/primitives";

export const metadata = {
  title: "宗亲社区 · 寻亲大厅与家族讨论",
  description: "寻亲信息、家族讨论、宗亲检索与分支关联申请。同姓不代表同宗，关联须双方确认与证据核验。",
};

export default function CommunityPage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="ink-bg border-b border-navy/40">
        <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">CLAN COMMUNITY</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-wide text-white md:text-4xl">宗亲社区</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
            寻亲大厅、家族讨论、活动公告与史料纠错。这里的信息由用户自行发布，平台不据此认定血缘关系；
            同姓不等于同宗，任何分支关联都需双方确认并附证据说明。
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-[11px] text-white/60">
            <Link href="/guide#clan" className="inline-flex items-center gap-1.5 rounded border border-white/20 px-3 py-1.5 hover:border-gold hover:text-gold">
              <ShieldCheck className="h-3.5 w-3.5" />关联规则说明
            </Link>
            <Link href="/legal/privacy" className="rounded border border-white/20 px-3 py-1.5 hover:border-gold hover:text-gold">隐私政策</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <SectionTitle eyebrow="COMMUNITY FEED" title="社区动态" description="公开内容对所有访客可见；家族可见与仅自己可见的内容不会出现在这里。" />
        <CommunityHub />
      </div>
    </div>
  );
}

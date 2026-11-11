import { MeCenter } from "@/components/me/me-center";

export const metadata = { title: "个人中心 · 中华寻根" };
export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <div className="paper-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-7">
          <div className="text-[11px] font-semibold tracking-[0.25em] text-gold">MY ACCOUNT</div>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink md:text-3xl">个人中心</h1>
          <p className="mt-2 text-sm text-graphite">资料、隐私授权、登录设备、通知、宗亲关联申请与个人数据管理。</p>
        </div>
        <MeCenter initialTab={tab} />
      </div>
    </div>
  );
}

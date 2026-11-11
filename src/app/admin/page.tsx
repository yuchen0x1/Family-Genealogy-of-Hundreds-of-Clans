import { AdminConsole } from "@/components/admin/admin-console";

export const metadata = { title: "管理后台 · 中华寻根" };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="ink-bg border-b border-navy/40">
        <div className="mx-auto max-w-7xl px-4 py-9 md:px-6">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">ADMIN CONSOLE</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white">管理后台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
            用户与角色、内容与举报审核、史料审核、审计日志与系统设置。后台只处理元数据与审核状态，
            不展示私有族谱的人物明细与档案正文。
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <AdminConsole />
      </div>
    </div>
  );
}

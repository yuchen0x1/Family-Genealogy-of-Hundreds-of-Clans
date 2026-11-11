import { MessagesView } from "@/components/me/messages-view";

export const metadata = { title: "私信 · 中华寻根" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const { with: withUser } = await searchParams;
  return (
    <div className="paper-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <div className="text-[11px] font-semibold tracking-[0.25em] text-gold">PRIVATE MESSAGES</div>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink md:text-3xl">私信</h1>
          <p className="mt-2 text-sm text-graphite">与宗亲沟通寻根线索。私信仅收发双方可见，平台不会据此认定亲属关系。</p>
        </div>
        <MessagesView initialWith={withUser} />
      </div>
    </div>
  );
}

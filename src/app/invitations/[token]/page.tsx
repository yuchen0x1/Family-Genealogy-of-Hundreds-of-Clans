import type { Metadata } from "next";
import { InvitationAccept } from "@/components/family/invitation-accept";
import { SectionTitle } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "接受家族协作邀请 · 中华寻根" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="paper-bg min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-12 md:px-6">
        <SectionTitle eyebrow="INVITATION" title="加入家族协作" />
        <InvitationAccept token={token} />
      </div>
    </div>
  );
}

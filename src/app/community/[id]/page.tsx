import { PostDetailView } from "@/components/community/post-detail";

export const metadata = { title: "社区内容 · 中华寻根" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="paper-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <PostDetailView postId={id} />
      </div>
    </div>
  );
}

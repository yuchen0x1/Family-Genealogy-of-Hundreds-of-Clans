import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostForm } from "@/components/community/post-form";

export const metadata = { title: "发布内容 · 宗亲社区" };

export default function NewPostPage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <Link href="/community" className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-graphite hover:text-gold">
          <ArrowLeft className="h-3.5 w-3.5" />返回社区
        </Link>
        <div className="mb-7">
          <div className="text-[11px] font-semibold tracking-[0.25em] text-gold">NEW POST</div>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink md:text-3xl">发布内容</h1>
          <p className="mt-2 text-sm text-graphite">发布寻亲线索、家族讨论或史料纠错。未登录用户会先跳转到登录页。</p>
        </div>
        <PostForm />
      </div>
    </div>
  );
}

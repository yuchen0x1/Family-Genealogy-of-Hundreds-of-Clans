import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui/primitives";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/me");
  return (
    <div className="paper-bg flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-gold/60 bg-navy font-serif text-2xl text-gold-light">尋</div>
          <h1 className="font-serif text-2xl font-semibold text-ink">创建账号</h1>
          <p className="mt-2 text-sm text-graphite">创建私有族谱，记录真实的一家人</p>
        </div>
        <Card className="p-6 shadow-lift"><AuthForm mode="register" /></Card>
        <p className="mt-5 text-center text-[11px] leading-5 text-graphite">
          你的家族资料默认私有；平台不会依据姓氏自动合并家族，也不会公开在世人物的敏感信息。
        </p>
      </div>
    </div>
  );
}

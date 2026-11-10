import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Card } from "@/components/ui/primitives";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/me");
  return (
    <div className="paper-bg flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-gold/60 bg-navy font-serif text-2xl text-gold-light">尋</div>
          <h1 className="font-serif text-2xl font-semibold text-ink">登录中华寻根</h1>
          <p className="mt-2 text-sm text-graphite">继续整理你的家族记忆</p>
        </div>
        <Card className="p-6 shadow-lift"><AuthForm mode="login" /></Card>
      </div>
    </div>
  );
}

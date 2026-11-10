"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && !agree) { setError("请先阅读并同意用户协议与隐私政策"); return; }
    setLoading(true);
    try {
      await apiRequest(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: mode === "login"
          ? { email, password }
          : { email, password, displayName, agreeTerms: true },
      });
      router.push(mode === "login" ? "/me" : "/families?mine=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "register" && (
        <div>
          <Label htmlFor="displayName">昵称</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="将展示在族谱协作与社区中" maxLength={100} required />
        </div>
      )}
      <div>
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">密码</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "register" ? "至少 8 位，含字母与数字" : "请输入密码"} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
      </div>
      {mode === "register" && (
        <label className="flex items-start gap-2 text-xs leading-5 text-graphite">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#b08d57]" />
          <span>我已阅读并同意 <Link href="/legal/terms" className="text-navy underline">用户协议</Link> 与 <Link href="/legal/privacy" className="text-navy underline">隐私政策</Link>，理解私有族谱默认不公开、在世人物信息默认保护。</span>
        </label>
      )}
      {error && <div className="rounded-md border border-[#edcdc7] bg-[#f9eae7] px-3 py-2 text-xs text-cinnabar">{error}</div>}
      <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
        {mode === "login" ? "登录" : "创建账号"}
      </Button>
      <div className="text-center text-xs text-graphite">
        {mode === "login" ? (
          <>还没有账号？<Link href="/register" className="text-navy underline">免费注册</Link></>
        ) : (
          <>已有账号？<Link href="/login" className="text-navy underline">直接登录</Link></>
        )}
      </div>
      {mode === "login" && (
        <div className="rounded-md border border-line bg-cream px-3 py-2 text-[11px] leading-5 text-graphite">
          演示账号：<code className="text-navy">demo@xungen.local</code> / <code className="text-navy">Demo_Xungen_2026</code>（仅用于体验演示族谱）
        </div>
      )}
    </form>
  );
}

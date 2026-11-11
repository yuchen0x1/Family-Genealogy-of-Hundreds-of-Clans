"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Search, Menu, X, ChevronDown, LogOut, User as UserIcon, Shield, BookOpen, Network, Map, Users } from "lucide-react";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "首页", icon: null },
  { href: "/surnames", label: "百家姓", icon: BookOpen },
  { href: "/roots", label: "历史寻根", icon: Map },
  { href: "/families", label: "族谱中心", icon: Network },
  { href: "/community", label: "宗亲社区", icon: Users },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, mutate } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ label: string; href: string; kind: string }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mobileOpen) {
        setMobileOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
      if (userOpen) {
        setUserOpen(false);
        userMenuButtonRef.current?.focus();
      }
      if (searchOpen) setSearchOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, userOpen, searchOpen]);

  useEffect(() => {
    if (!q.trim()) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const data = await fetcher<{ suggestions: Array<{ label: string; href: string; kind: string }> }>(
          `/api/search/suggest?q=${encodeURIComponent(q.trim())}`,
        );
        if (active) setSuggestions(data.suggestions || []);
      } catch {
        if (active) setSuggestions([]);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const logout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST", body: {} });
    await mutate();
    setUserOpen(false);
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-cream/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gold/60 bg-navy font-serif text-lg text-gold-light transition-transform group-hover:scale-105">
            尋
          </div>
          <div className="hidden sm:block">
            <div className="font-serif text-[15px] font-semibold leading-tight tracking-[0.18em] text-ink">中华寻根</div>
            <div className="text-[10px] tracking-[0.3em] text-gold">百家族谱</div>
          </div>
        </Link>

        <nav aria-label="主导航" className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  active ? "bg-navy/5 text-navy" : "text-ink-soft hover:bg-cream-dark hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden max-w-[280px] flex-1 md:block" ref={boxRef}>
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                if (!v.trim()) setSuggestions([]);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              aria-autocomplete="list"
              aria-controls={searchOpen && suggestions.length > 0 ? "site-search-suggestions" : undefined}
              placeholder="搜索姓氏、人物、祖籍、族谱…"
              className="h-9 w-full rounded-full border border-line bg-white/80 pl-9 pr-3 text-[13px] placeholder:text-graphite/60 focus:border-gold focus:outline-none"
              aria-label="全站搜索"
            />
            {searchOpen && suggestions.length > 0 && (
              <ul id="site-search-suggestions" aria-label="搜索建议" className="absolute left-0 right-0 top-11 overflow-hidden rounded-lg border border-line bg-white shadow-lift">
                {suggestions.map((s, i) => (
                  <li key={`${s.href}-${i}`}>
                    <Link
                      href={s.href}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between px-3 py-2 text-[13px] text-ink hover:bg-cream"
                    >
                      <span>{s.label}</span>
                      <span className="text-[11px] text-graphite">{s.kind}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {me?.authenticated ? (
            <div className="relative">
              <button
                ref={userMenuButtonRef}
                onClick={() => setUserOpen((v) => !v)}
                aria-expanded={userOpen}
                aria-controls={userOpen ? "site-user-menu" : undefined}
                className="flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1.5 text-[13px] hover:border-gold"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] text-white">
                  {me.user?.displayName.slice(0, 1) || "用"}
                </span>
                <span className="hidden max-w-24 truncate sm:inline">{me.user?.displayName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-graphite" />
              </button>
              {userOpen && (
                <nav id="site-user-menu" aria-label="用户菜单" className="absolute right-0 top-11 w-52 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lift">
                  <MenuLink href="/me" icon={<UserIcon className="h-4 w-4" />} label="个人中心" onClick={() => setUserOpen(false)} />
                  <MenuLink href="/families?mine=1" icon={<Network className="h-4 w-4" />} label="我的族谱" onClick={() => setUserOpen(false)} />
                  {me.user?.isAdmin && <MenuLink href="/admin" icon={<Shield className="h-4 w-4" />} label="管理后台" onClick={() => setUserOpen(false)} />}
                  <div className="my-1 border-t border-line" />
                  <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-cinnabar hover:bg-cream">
                    <LogOut className="h-4 w-4" /> 退出登录
                  </button>
                </nav>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-[13px] text-ink-soft hover:text-ink sm:block">登录</Link>
              <Link href="/register" className="rounded-md bg-navy px-3.5 py-2 text-[13px] font-medium text-white hover:bg-navy-light">注册</Link>
            </>
          )}
          <button
            ref={mobileMenuButtonRef}
            className="rounded-md p-2 text-ink-soft hover:bg-cream-dark lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "关闭菜单" : "展开菜单"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-primary-navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div id="mobile-primary-navigation" hidden={!mobileOpen} className="border-t border-line bg-cream px-4 py-3 lg:hidden">
          <form onSubmit={submitSearch} className="relative mb-3 md:hidden">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓氏、人物、祖籍…"
              className="h-9 w-full rounded-full border border-line bg-white pl-9 pr-3 text-[13px] focus:border-gold focus:outline-none"
            />
          </form>
          <div className="grid grid-cols-2 gap-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-white">
                  {item.label}
                </Link>
              );
            })}
          </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2 px-4 py-2 text-[13px] text-ink hover:bg-cream">
      {icon} {label}
    </Link>
  );
}

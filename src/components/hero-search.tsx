"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, ArrowRight } from "lucide-react";

const QUICK = ["李", "王", "张", "陈", "欧阳", "陇西郡", "苏轼", "字辈"];

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (value: string) => {
    const v = value.trim();
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => { e.preventDefault(); go(q); }}
        className="group flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 p-1.5 backdrop-blur-md transition-colors focus-within:border-gold-light/80 focus-within:bg-white/15"
      >
        <Search className="ml-3 h-5 w-5 shrink-0 text-gold-light" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入姓氏、拼音、异体字、人物、祖籍或家族名称"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none"
          aria-label="姓氏与族谱搜索"
        />
        <button type="submit" className="hidden h-11 shrink-0 items-center gap-1.5 rounded-lg bg-gold px-5 text-sm font-medium text-white transition hover:brightness-110 sm:flex">
          寻根 <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-white/45">试试：</span>
        {QUICK.map((item) => (
          <button
            key={item}
            onClick={() => go(item)}
            className="rounded-full border border-white/20 px-2.5 py-1 text-white/75 transition hover:border-gold-light hover:text-white"
          >
            {item}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/45">
        支持中文姓氏、拼音、繁体与异体字；结果按历史资料 / 历史人物 / 用户族谱 / 寻亲信息分类，并自动过滤无权限访问的私有内容。
      </p>
    </div>
  );
}

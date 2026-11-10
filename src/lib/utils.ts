import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

export function truncate(s: string | null | undefined, len = 120): string {
  if (!s) return "";
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

/** 年份展示：负数表示公元前 */
export function formatYear(year: number | null | undefined): string {
  if (year === null || year === undefined) return "年代不详";
  return year < 0 ? `公元前 ${Math.abs(year)} 年` : `${year} 年`;
}

export function fullName(surname: string, given: string): string {
  return `${surname}${given}`.replace(/演示·/g, "");
}

export function evidenceLabel(level: string): string {
  return ({
    DOCUMENTED: "史料明确记载",
    TRADITION: "地方传说",
    INFERRED: "研究推测",
    UNVERIFIED: "待核实",
  } as Record<string, string>)[level] || "待核实";
}

export function reviewLabel(status: string): string {
  return ({
    DRAFT: "草稿",
    PENDING: "待审核",
    APPROVED: "已审定",
    REJECTED: "未通过",
    DISPUTED: "存疑",
  } as Record<string, string>)[status] || "待审核";
}

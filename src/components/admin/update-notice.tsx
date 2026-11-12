"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/client";
import type { UpdateState } from "@/lib/updater";
import { dismissKey, noticeTarget } from "@/lib/update-notice";

/**
 * 更新提示：让管理员不必主动点开「系统设置 → 系统更新」也能知道有新版。
 *
 * 只做「提示」，不做「决定」：是否可更新仍由服务端 getUpdateState 判定
 * （当前版本读 package.json、目标版本只能来自上游），前端拿不到也改不了目标版本。
 *
 * 请求成本：与服务端 5 分钟缓存对齐，客户端也按同一节奏去重，
 * 避免每次进出后台都打一次 GitHub（匿名配额只有 60 次/小时）。
 */
const STATE_KEY = "/api/admin/system/update";

/** 只有管理员该看到更新提示；非管理员传 false，SWR 直接不发请求（key 为 null）。 */
export function useUpdateNotice(enabled: boolean): UpdateState | null {
  const { data } = useSWR<UpdateState>(enabled ? STATE_KEY : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 300_000,
    refreshInterval: 300_000,
  });
  return data ?? null;
}

/* --------------------- 关闭状态（localStorage + 外部订阅） --------------------- */

// 关闭状态按「目标版本」记：关掉 0.2.1 的提示，等 0.3.0 发布时仍会提示。
// 用 localStorage 而不是服务端字段，是因为这纯属个人视图偏好，不值得落库。
// 读写走 useSyncExternalStore，避免在 effect 里 setState 造成级联渲染。

const listeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function snapshotDismissed(version: string | null): string {
  if (!version) return "0";
  try {
    // 隐私模式/禁用存储时读不到，就当作未关闭：宁可多提示一次也不能吞掉提醒
    return window.localStorage.getItem(dismissKey(version)) === "1" ? "1" : "0";
  } catch {
    return "0";
  }
}

function useDismissed(version: string | null): [boolean, () => void] {
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => snapshotDismissed(version),
    // 服务端渲染阶段没有 localStorage；此时上游状态也还没拿到，不会渲染出提示条
    () => "0",
  );

  const dismiss = useCallback(() => {
    if (!version) return;
    try {
      window.localStorage.setItem(dismissKey(version), "1");
    } catch {
      /* 存不下也不影响本次隐藏 */
    }
    for (const listener of listeners) listener();
  }, [version]);

  return [dismissed === "1", dismiss];
}

export function UpdateBanner({
  state,
  onAction,
  href,
  actionLabel = "前往更新",
}: {
  state: UpdateState | null;
  /** 在当前页切换视图时使用（如后台切到「系统设置」页签） */
  onAction?: () => void;
  /** 需要跳转到别的页面时使用 */
  href?: string;
  actionLabel?: string;
}) {
  const target = noticeTarget(state);
  const [dismissed, dismiss] = useDismissed(target?.version ?? null);

  if (!target || dismissed) return null;

  const action = onAction ?? null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-[#fbf7ee] px-4 py-3" role="status">
      <Download className="h-4 w-4 shrink-0 text-gold" />
      <div className="min-w-0 flex-1 text-[12px] leading-5 text-graphite">
        <span className="font-medium text-ink">发现新版本 {target.version}</span>
        <span className="mx-1.5 text-line">|</span>
        当前运行 {target.current}，可查看更新日志后升级。
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action && <Button size="sm" variant="gold" onClick={action}>{actionLabel}</Button>}
        {!action && href && <Link href={href}><Button size="sm" variant="gold">{actionLabel}</Button></Link>}
        <button type="button" onClick={dismiss} aria-label="关闭更新提示" className="rounded p-1 text-graphite transition-colors hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** 导航项上的小圆点：有新版本时提示，不打断操作。 */
export function UpdateDot() {
  return (
    <span className="ml-auto flex h-2 w-2 shrink-0" aria-label="有新版本可更新" title="有新版本可更新">
      <span className="h-2 w-2 rounded-full bg-cinnabar" />
    </span>
  );
}

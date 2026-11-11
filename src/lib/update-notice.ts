/**
 * 更新提示的纯判定逻辑（无 DOM 依赖，便于单测）。
 *
 * 组件只负责渲染，是否该提示、按哪个版本记「已关闭」都在这里决定，
 * 这样「有新版本才提示」「提示按目标版本记忆」这两条规则可以被测试固定住。
 */
import type { UpdateState } from "@/lib/updater";

export const UPDATE_DISMISS_PREFIX = "xungen.update.dismissed";

export type UpdateNoticeTarget = {
  /** 上游目标版本（stable 通道为版本号，branch 通道为 commit 前缀） */
  version: string;
  /** 本机当前运行的版本 */
  current: string;
};

/** 「已关闭」键按目标版本区分：关掉 0.2.1 后，0.3.0 发布时仍应提示。 */
export function dismissKey(version: string): string {
  return `${UPDATE_DISMISS_PREFIX}.${version}`;
}

/**
 * 需要提示时返回目标版本，否则返回 null。
 *
 * 判空条件都是「宁可不提示」：上游缺失、版本号为空、未判定可更新时一律不提示，
 * 因为错误的更新提示会让人去点一个并不存在的升级。
 */
export function noticeTarget(state: UpdateState | null | undefined): UpdateNoticeTarget | null {
  if (!state || !state.updateAvailable || !state.upstream) return null;
  const version = String(state.upstream.version ?? "").trim();
  if (!version) return null;
  return { version, current: state.current.version };
}

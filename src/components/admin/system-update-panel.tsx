"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowRight, CheckCircle2, Download, History, Loader2, RefreshCw, RotateCcw, ShieldCheck,
  Server, ShieldAlert, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, Input } from "@/components/ui/primitives";
import { Field, Modal, Notice, formatDate, parseError, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest } from "@/lib/client";
import type { JobView, UpdateState } from "@/lib/updater";

/** 与 UpdateState 的字段保持一致（服务端类型在此仅作编译期约束，不会把 node 模块打进客户端 bundle） */
type StageKey = "BACKUP" | "DOWNLOAD" | "VERIFY" | "INSTALL" | "RESTART" | "DONE";
const STAGE_ORDER: StageKey[] = ["BACKUP", "DOWNLOAD", "VERIFY", "INSTALL", "RESTART", "DONE"];
const STAGE_TEXT: Record<StageKey, string> = {
  BACKUP: "备份",
  DOWNLOAD: "下载",
  VERIFY: "校验",
  INSTALL: "安装构建",
  RESTART: "重启",
  DONE: "完成",
};

function isRunning(job: JobView | null | undefined): boolean {
  return Boolean(job && (job.status === "QUEUED" || job.status === "RUNNING"));
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cream-dark" role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out" style={{ width: `${safe}%` }} />
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-[11px] text-graphite">{label}</span>
      <span className="min-w-0 break-all text-right text-[12px] text-ink">{children}</span>
    </div>
  );
}

function statusBadge(state: UpdateState) {
  if (state.activeJob) return <Badge tone="gold">更新进行中</Badge>;
  if (state.upstreamError) return <Badge tone="red">检查失败</Badge>;
  if (state.undeterminedReason) return <Badge tone="neutral">无法判断</Badge>;
  if (state.updateAvailable) return <Badge tone="jade">有新版本</Badge>;
  return <Badge tone="neutral">已是最新</Badge>;
}

export function SystemUpdatePanel() {
  const { data, isLoading, mutate } = useSWR<UpdateState>("/api/admin/system/update", fetcher);

  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [checking, setChecking] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [applying, setApplying] = useState(false);
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);

  // 服务端仍有活跃任务时永远以它为准（可能是别的管理员刚发起的），
  // 否则优先展示本次会话刚发起、正在收尾的那个任务，最后退回最近一次任务。
  // 不能无条件优先 trackedJobId：那样别人发起新更新后，本页会一直停在旧任务上。
  const jobId = data?.activeJob?.id ?? trackedJobId ?? data?.latestJob?.id ?? null;
  const { data: job, error: jobError } = useSWR<JobView>(
    jobId ? `/api/admin/system/update/jobs/${jobId}` : null,
    fetcher,
    {
      refreshInterval: (latest) => (latest && !isRunning(latest) ? 0 : 1500),
      shouldRetryOnError: true,
      errorRetryInterval: 3000,
      revalidateOnFocus: false,
    },
  );

  const visibleJob = job ?? data?.activeJob ?? data?.latestJob ?? null;
  const running = isRunning(visibleJob);
  const terminal = Boolean(visibleJob && !isRunning(visibleJob));

  // 任务进入终态后刷新总状态，让「当前版本」等字段同步更新
  useEffect(() => {
    if (terminal) void mutate();
  }, [terminal, mutate]);

  const stageIndex = useMemo(() => {
    const stage = (visibleJob?.stage ?? "QUEUED") as StageKey;
    return STAGE_ORDER.indexOf(stage);
  }, [visibleJob?.stage]);

  /**
   * 把任务日志整理成可粘贴给运维的纯文本。
   * 带完整时间戳（不是页面上的时分秒），因为排障需要精确到日期与秒。
   */
  function formatLog(job: JobView): string {
    const head = [
      `任务 ${job.id}`,
      `版本 ${job.fromVersion} → ${job.targetVersion}（驱动 ${job.driver}）`,
      `状态 ${job.status} / ${job.stage} / ${job.progress}%`,
      `创建 ${job.createdAt}${job.startedAt ? ` · 开始 ${job.startedAt}` : ""}${job.finishedAt ? ` · 结束 ${job.finishedAt}` : ""}`,
      job.error ? `错误 ${job.error}` : "",
      "",
    ].filter(Boolean);
    const lines = job.log.map((e) => `${e.at}\t${e.level.toUpperCase()}\t${e.text}`);
    return [...head, ...lines].join("\n");
  }

  async function copyLog(job: JobView): Promise<void> {
    const text = formatLog(job);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLog(true);
      window.setTimeout(() => setCopiedLog(false), 2000);
    } catch {
      // 剪贴板可能因非安全上下文或无权限而失败；退化到可选中的临时文本域
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      setNotice(
        ok
          ? { kind: "success", title: "日志已复制" }
          : { kind: "warning", title: "复制失败", lines: ["浏览器拒绝了剪贴板访问，请改用「导出」下载日志文件。"] },
      );
    }
  }

  function downloadLog(job: JobView): void {
    const blob = new Blob([formatLog(job)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    // 文件名带版本与任务短 ID，方便同时保留多次排障记录
    link.href = url;
    link.download = `update-${job.targetVersion}-${job.id.slice(0, 8)}.log.txt`;
    link.click();
    // 立即释放：下载已在 click 后开始，不释放会泄漏内存
    URL.revokeObjectURL(url);
  }

  async function check() {
    setChecking(true);
    setNotice(null);
    try {
      await apiRequest<UpdateState>("/api/admin/system/update/check", { method: "POST" });
      await mutate();
      setNotice({ kind: "success", title: "已重新检查上游版本" });
    } catch (err) {
      setNotice(parseError(err));
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    if (confirmText !== "UPDATE") {
      setNotice({ kind: "warning", title: "请输入 UPDATE 以确认", lines: ["该操作会重启服务，必须显式确认。"] });
      return;
    }
    setApplying(true);
    setNotice(null);
    try {
      const created = await apiRequest<JobView>("/api/admin/system/update", {
        method: "POST",
        body: { confirm: "UPDATE" },
      });
      setTrackedJobId(created.id);
      setConfirmOpen(false);
      setConfirmText("");
      await mutate();
    } catch (err) {
      setNotice(parseError(err));
    } finally {
      setApplying(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 text-sm text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在读取版本信息…
        </CardBody>
      </Card>
    );
  }

  const { current, pairing, upstream } = data;
  const simulate = pairing.driver === "SIMULATE";

  return (
    <div className="space-y-4">
      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}

      {simulate && (
        <Card className="border-cinnabar/40 bg-[#fdf3f1]">
          <CardBody className="flex items-start gap-2 text-[11px] leading-6 text-ink">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cinnabar" />
            <span>
              当前为 <strong>模拟驱动（SIMULATE）</strong>：点击更新只会演示进度，不会真正修改文件，也不会重启服务。
              正式部署请将 <code className="font-mono">APP_UPDATE_DRIVER</code> 设为 <code className="font-mono">SOURCE</code>（源码部署）或{" "}
              <code className="font-mono">DOCKER</code>（容器部署）。
            </span>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-navy" />
                <h3 className="font-serif text-base font-semibold text-ink">系统更新</h3>
                {statusBadge(data)}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-graphite">
                从上游仓库检查新版本，下载并构建后自动重启服务完成升级。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void check()} loading={checking} disabled={running}>
                <RefreshCw className="h-3.5 w-3.5" />
                检查更新
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNotesOpen(true)} disabled={!upstream}>
                <History className="h-3.5 w-3.5" />
                查看更新日志
              </Button>
              <Button
                size="sm"
                variant="gold"
                disabled={!data.updateAvailable || running}
                onClick={() => setConfirmOpen(true)}
              >
                <Download className="h-3.5 w-3.5" />
                立即更新
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-cream/50 p-3">
              <div className="text-[11px] text-graphite">当前版本</div>
              <div className="mt-1 font-mono text-[15px] text-ink">v{current.version}</div>
              <div className="mt-1 text-[11px] text-ink-soft">
                提交 {current.commit === "unknown" ? "未知（镜像未注入）" : current.commit.slice(0, 7)}
                {current.buildTime ? ` · 构建于 ${formatDate(current.buildTime)}` : ""}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-cream/50 p-3">
              <div className="text-[11px] text-graphite">上游最新版本</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[15px] text-ink">
                {upstream ? (upstream.source === "commit" ? upstream.version.slice(0, 7) : `v${upstream.version}`) : "—"}
                {data.updateAvailable && upstream && (
                  <>
                    <ArrowRight className="h-3.5 w-3.5 text-graphite" />
                    <span className="text-[12px] text-jade">待更新</span>
                  </>
                )}
              </div>
              <div className="mt-1 text-[11px] text-ink-soft">
                {upstream?.publishedAt ? `发布于 ${formatDate(upstream.publishedAt)}` : upstream ? "未标注发布时间" : "尚未取得"}
              </div>
            </div>
          </div>

          {data.upstreamError && (
            <div className="flex items-start gap-2 rounded-lg border border-cinnabar/30 bg-[#fdf3f1] p-3 text-[11px] leading-5 text-ink">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cinnabar" />
              <span>{data.upstreamError.message}</span>
            </div>
          )}

          {data.undeterminedReason && !data.upstreamError && (
            <div className="flex items-start gap-2 rounded-lg border border-line bg-cream/60 p-3 text-[11px] leading-5 text-graphite">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{data.undeterminedReason}</span>
            </div>
          )}

          {upstream && (
            <div className="rounded-lg border border-line bg-cream/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-graphite">
                <ShieldCheck className="h-3.5 w-3.5" />
                发布完整性
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <MetaRow label="发布资产">{upstream.asset?.name ?? "源码包（仅分支/旧 tag）"}</MetaRow>
                <MetaRow label="资产大小">{upstream.asset?.size ? `${(upstream.asset.size / 1024 / 1024).toFixed(1)} MB` : "—"}</MetaRow>
                <MetaRow label="SHA-256">
                  <span className="font-mono">{upstream.asset?.digest?.replace(/^sha256:/i, "").slice(0, 16) ?? "更新时校验"}{upstream.asset?.digest ? "…" : ""}</span>
                </MetaRow>
                <MetaRow label="更新性质">
                  {upstream.securityFix ? "安全修复" : "常规更新"}{upstream.mandatory ? " · 必须更新" : " · 可选更新"}
                </MetaRow>
              </div>
              {upstream.minSupportedVersion && (
                <p className="mt-2 text-[11px] leading-5 text-graphite">最低支持版本：v{upstream.minSupportedVersion}</p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-graphite">
              <RotateCcw className="h-3.5 w-3.5" />
              实例配对
            </div>
            <MetaRow label="实例">{pairing.instanceName}</MetaRow>
            <MetaRow label="实例标识"><span className="font-mono">{pairing.instanceId}</span></MetaRow>
            <MetaRow label="上游仓库">
              <span className="font-mono">{pairing.repo}</span>
              {!pairing.repoFromEnv && <span className="ml-1 text-graphite">（内置默认）</span>}
            </MetaRow>
            <MetaRow label="更新通道">
              {pairing.channel === "stable" ? "稳定版（Release / tag）" : `分支跟踪（${pairing.branch}）`}
            </MetaRow>
            <MetaRow label="更新驱动">
              {pairing.driver === "SOURCE" ? "源码部署（本地构建后重启）" : pairing.driver === "DOCKER" ? "容器部署（sidecar 重建镜像）" : "模拟（不修改文件）"}
            </MetaRow>
            <MetaRow label="更新前备份">{data.backupRequired ? "强制备份，失败即中止" : "已跳过（APP_UPDATE_SKIP_BACKUP=true）"}</MetaRow>
          </div>
        </CardBody>
      </Card>

      {visibleJob && (
        <Card className={terminal && visibleJob.status === "FAILED" ? "border-cinnabar/40" : ""}>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {running ? <Loader2 className="h-4 w-4 animate-spin text-gold" /> : visibleJob.status === "SUCCEEDED" ? <CheckCircle2 className="h-4 w-4 text-jade" /> : <TriangleAlert className="h-4 w-4 text-cinnabar" />}
                <span className="text-sm font-medium text-ink">
                  {running ? `正在更新 ${visibleJob.fromVersion} → ${visibleJob.targetVersion}` : visibleJob.status === "SUCCEEDED" ? "更新已完成" : "更新失败"}
                </span>
              </div>
              <span className="font-mono text-[11px] text-graphite">{visibleJob.progress}%</span>
            </div>

            <ProgressBar value={visibleJob.progress} />

            <div className="flex flex-wrap items-center gap-1.5">
              {STAGE_ORDER.filter((s) => s !== "DONE").map((stage, i) => {
                const done = stageIndex >= 0 && i < stageIndex;
                const active = i === stageIndex;
                return (
                  <span
                    key={stage}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      active ? "border-gold bg-gold/15 text-ink" : done ? "border-jade/40 bg-jade/10 text-jade" : "border-line text-graphite"
                    }`}
                  >
                    {STAGE_TEXT[stage]}
                  </span>
                );
              })}
            </div>

            {(() => {
              const live = visibleJob;
              if (!live) return null;
              return (
                <>
                  <div className="text-[12px] text-ink-soft">{live.message ?? "—"}</div>
                  {live.error && <div className="rounded border border-cinnabar/30 bg-[#fdf3f1] p-2 text-[11px] leading-5 text-ink">{live.error}</div>}
                  {live.log.length > 0 && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold tracking-wide text-graphite">执行日志（{live.log.length} 条）</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void copyLog(live)}
                            className="rounded border border-line bg-white px-2 py-0.5 text-[10px] text-ink transition-colors hover:bg-cream-dark focus:outline-none focus:ring-2 focus:ring-gold/40"
                          >
                            {copiedLog ? "已复制" : "复制"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadLog(live)}
                            className="rounded border border-line bg-white px-2 py-0.5 text-[10px] text-ink transition-colors hover:bg-cream-dark focus:outline-none focus:ring-2 focus:ring-gold/40"
                          >
                            导出
                          </button>
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded border border-line bg-cream/40 p-2 font-mono text-[10px] leading-5 text-graphite">
                        {live.log.map((entry, i) => (
                          <div key={`${entry.at}-${i}`} className={entry.level === "error" ? "text-cinnabar" : entry.level === "warn" ? "text-gold" : ""}>
                            <span className="opacity-60">{new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })}</span> {entry.text}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}

            {jobError && running && (
              <div className="rounded border border-gold/40 bg-[#fbf7ee] p-2 text-[11px] leading-5 text-ink">
                服务正在重启，暂时无法获取进度；恢复后会自动继续。
              </div>
            )}

            {terminal && visibleJob.status === "SUCCEEDED" && (
              <div className="text-[11px] leading-5 text-graphite">
                若页面仍显示旧版本，说明服务正在重启，稍后刷新即可。
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title={upstream ? `更新日志 · ${upstream.source === "commit" ? upstream.version.slice(0, 7) : `v${upstream.version}`}` : "更新日志"}
        description={upstream?.publishedAt ? `发布于 ${formatDate(upstream.publishedAt)}` : undefined}
        wide
        footer={
          <>
            {upstream?.url && (
              <a href={upstream.url} target="_blank" rel="noreferrer noopener" className="mr-auto text-[11px] text-navy underline">
                在仓库中查看
              </a>
            )}
            <Button size="sm" variant="outline" onClick={() => setNotesOpen(false)}>关闭</Button>
          </>
        }
      >
        <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-6 text-ink">
          {upstream?.notes || "该版本未提供更新说明。"}
        </pre>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmText(""); }}
        title="确认更新"
        description="该操作会下载并安装新版本，随后重启服务。"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>取消</Button>
            <Button size="sm" variant="danger" loading={applying} disabled={confirmText !== "UPDATE"} onClick={() => void apply()}>
              开始更新
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-cream/50 p-3 text-center font-mono text-[13px] text-ink">
            v{current.version} <span className="mx-2 text-graphite">→</span> v{upstream?.version ?? "?"}
          </div>
          <ul className="space-y-1.5 text-[11px] leading-6 text-ink-soft">
            <li>· 更新前会{data.backupRequired ? "自动备份数据库与上传文件，备份失败将中止" : "跳过备份（已配置跳过）"}</li>
            <li>· 安装与构建期间服务可能短暂不可用，重启后自动恢复</li>
            <li>· 构建失败会自动回滚到更新前的源码</li>
            <li>· 请确保这不是唯一一份部署，且已有可用的数据库备份</li>
          </ul>
          <Field label="输入 UPDATE 以确认" hint="该字面量用于防误触，与导入、版本恢复等危险操作保持一致">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="UPDATE" autoComplete="off" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

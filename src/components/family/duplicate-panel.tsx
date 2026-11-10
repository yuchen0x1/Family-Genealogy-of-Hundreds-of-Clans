"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, TriangleAlert, Users } from "lucide-react";
import { Badge, Card, CardBody, EmptyState, ErrorState } from "@/components/ui/primitives";
import { fetcher } from "@/lib/client";
import type { DuplicateConfidence, DuplicatePair, DuplicateReport } from "@/lib/duplicate-detection";

/**
 * 疑似重复人物核对清单。
 *
 * 设计要点：
 * - 只展示、不提供「一键合并」：同名不代表同一人，自动合并会破坏血亲结构。
 * - 每条都列出判定依据，让人能自己判断，而不是相信一个无从解释的分数。
 * - 直接链到人物编辑页，核对与修正都回到既有流程。
 */

const CONFIDENCE_META: Record<DuplicateConfidence, { label: string; tone: "red" | "gold" | "neutral"; hint: string }> = {
  HIGH: { label: "高度疑似", tone: "red", hint: "姓名与可区分的时间字段一致，优先核对" },
  MEDIUM: { label: "可能重复", tone: "gold", hint: "姓名相同，时间字段不足以区分" },
  LOW: { label: "仅供核对", tone: "neutral", hint: "存在冲突或仅有关联线索，未必是同一人" },
};

function MemberLine({ member }: { member: DuplicatePair["members"][number] }) {
  const years = [
    member.birthYear !== null ? `生 ${member.birthYear}` : "生年未录",
    member.deathYear !== null ? `卒 ${member.deathYear}` : member.isLiving ? "在世" : "卒年未录",
  ].join(" · ");
  const meta = [member.generationNumber !== null ? `第 ${member.generationNumber} 代` : null, member.gender === "MALE" ? "男" : member.gender === "FEMALE" ? "女" : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="min-w-0">
        <span className="font-serif text-sm text-ink">{member.name}</span>
        {meta && <span className="ml-2 text-[10px] text-graphite">{meta}</span>}
      </div>
      <span className="text-[10px] tabular-nums text-ink-soft">{years}</span>
    </div>
  );
}

export function DuplicatePanel({ familyId, canWrite }: { familyId: string; canWrite: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<DuplicateReport>(
    `/api/families/${familyId}/duplicates`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [filter, setFilter] = useState<"ALL" | DuplicateConfidence>("ALL");

  if (isLoading) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 text-sm text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在比对人物…
        </CardBody>
      </Card>
    );
  }
  if (error) {
    return <ErrorState title="检测失败" description="无法读取人物列表进行比对，请稍后重试。" onRetry={() => void mutate()} />;
  }
  if (!data) return null;

  if (data.scanned === 0) {
    return <EmptyState title="还没有可比对的人物" description="先在「人物管理」中录入家族成员，本页会自动检查疑似重复。" />;
  }

  const visible = filter === "ALL" ? data.pairs : data.pairs.filter((p) => p.confidence === filter);
  const counts = {
    ALL: data.pairs.length,
    HIGH: data.pairs.filter((p) => p.confidence === "HIGH").length,
    MEDIUM: data.pairs.filter((p) => p.confidence === "MEDIUM").length,
    LOW: data.pairs.filter((p) => p.confidence === "LOW").length,
  };

  return (
    <div className="space-y-4">
      <Card className="border-gold/40 bg-[#fbf7ee]">
        <CardBody className="flex items-start gap-2 text-[11px] leading-6 text-ink">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6a35]" />
          <span>
            <strong>这里只做提示，不提供任何自动合并。</strong>
            同名不代表同一人——同名同姓、字辈相同的兄弟在族谱里很常见。合并会把两人的配偶与子女挂到一个人身上，
            而这类错误极难发现。请逐条核对后再决定保留、修正还是删除。
          </span>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((key) => {
            const label = key === "ALL" ? "全部" : CONFIDENCE_META[key].label;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                  filter === key ? "border-navy bg-navy text-white" : "border-line bg-white text-ink-soft hover:bg-cream"
                }`}
              >
                {label} {counts[key]}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-graphite">
          已比对 {data.scanned} 人
          {data.notScanned > 0 && ` · 超出 ${data.scanLimit} 人上限，另有 ${data.notScanned} 人未参与比对`}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={data.pairs.length === 0 ? "未发现疑似重复的人物" : "该档位下没有配对"}
          description={
            data.pairs.length === 0
              ? `已比对 ${data.scanned} 人，姓名与关联线索均未发现重复。新增人物后本页会重新检查。`
              : "切换到其他档位查看。"
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visible.map((pair) => {
            const meta = CONFIDENCE_META[pair.confidence];
            return (
              <Card key={pair.key}>
                <CardBody className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-[10px] text-graphite">{meta.hint}</span>
                    </div>
                    {canWrite && (
                      <a
                        href="#tab=people"
                        className="text-[11px] text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
                      >
                        去人物管理核对
                      </a>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {pair.members.map((m) => (
                      <div key={m.id} className="rounded-lg border border-line bg-cream/40 p-2.5">
                        <MemberLine member={m} />
                        <div className="mt-1 font-mono text-[9px] text-ink-soft">{m.id.slice(0, 8)}</div>
                      </div>
                    ))}
                  </div>

                  <ul className="space-y-0.5 border-t border-line/60 pt-2">
                    {pair.reasons.map((reason) => (
                      <li key={reason} className="flex gap-1.5 text-[11px] leading-5 text-ink-soft">
                        <CheckCircle2 className="mt-1 h-3 w-3 shrink-0 text-graphite/60" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] leading-5 text-ink-soft">
        <Users className="h-3 w-3" />
        检测只在当前族谱内进行，不跨族谱、不读取生平与联系方式，也不会修改任何数据。
      </p>
    </div>
  );
}

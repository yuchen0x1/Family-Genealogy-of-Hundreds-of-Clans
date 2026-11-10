"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { BarChart3, GitBranch, Loader2, Sprout, Users } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState } from "@/components/ui/primitives";
import { fetcher } from "@/lib/client";
import type { FamilyStats } from "@/lib/family-stats";

/**
 * 家族统计。
 *
 * 图表刻意用 CSS 条形而非 ECharts：统计只需要「长度对比」这一种表达，
 * 引入图表库会为单个面板增加数百 KB 的运行时，而 CSS 条在移动端也不会有
 * canvas 缩放模糊的问题。
 */

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
  tone?: "navy" | "gold" | "jade";
}) {
  const tones = {
    navy: "bg-[#e9edf4] text-navy",
    gold: "bg-[#f6efdf] text-[#8a6a35]",
    jade: "bg-[#e8f1ef] text-[#2f5a58]",
  } as const;
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] text-graphite">{label}</div>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 font-serif text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-[10px] leading-4 text-ink-soft">{hint}</div>}
    </div>
  );
}

/** 横向条形图：label / 数值 / 相对最大值的条长。 */
function BarList({
  items,
  emptyText,
  unit = "人",
}: {
  items: Array<{ key: string; label: string; count: number }>;
  emptyText: string;
  unit?: string;
}) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.count)), [items]);
  if (items.length === 0) return <p className="py-3 text-[11px] text-graphite">{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-ink">{item.label}</span>
            <span className="shrink-0 tabular-nums text-graphite">
              {item.count}
              {unit}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream-dark">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 border-t border-line/60 pt-2 text-[10px] leading-5 text-ink-soft">{children}</p>;
}

export function FamilyStatsPanel({ familyId }: { familyId: string }) {
  const { data, error, isLoading, mutate } = useSWR<FamilyStats>(
    `/api/families/${familyId}/stats`,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 text-sm text-graphite">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在统计…
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return <ErrorState title="统计加载失败" description="无法获取家族统计数据，请稍后重试。" onRetry={() => void mutate()} />;
  }

  if (!data) return null;

  const { totals, gender, generations, generationChars, decades, yearRange, branches, verification, livingAges, livingDetailsIncluded } = data;

  if (totals.members === 0) {
    return <EmptyState title="还没有可统计的人物" description="先在「人物管理」中添加家族成员，统计会自动汇总。" />;
  }

  const maxDecade = Math.max(1, ...decades.map((d) => d.births + d.deaths));
  const generationSpread = generations.length > 0
    ? `第 ${generations[0].generationNumber}–${generations[generations.length - 1].generationNumber} 代`
    : "未录世代";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="家族成员"
          value={totals.members}
          hint={`${totals.living} 在世 · ${totals.deceased} 已故`}
          icon={Users}
          tone="navy"
        />
        <StatCard
          label="世代跨度"
          value={generations.length > 0 ? generations.length : "—"}
          hint={generationSpread}
          icon={GitBranch}
          tone="gold"
        />
        <StatCard
          label="分支"
          value={totals.branches}
          hint={totals.branches > 0 ? "已建分支数量" : "尚未划分分支"}
          icon={Sprout}
          tone="jade"
        />
        <StatCard
          label="生卒年份"
          value={yearRange.min !== null && yearRange.max !== null ? `${yearRange.min}–${yearRange.max}` : "—"}
          hint={`${totals.withBirthYear} 人有可解析的出生年`}
          icon={BarChart3}
          tone="navy"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-sm font-semibold text-ink">性别构成</h3>
            <Badge tone="neutral">{totals.members} 人</Badge>
          </CardHeader>
          <CardBody>
            <BarList items={gender} emptyText="暂无数据" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-sm font-semibold text-ink">资料核实状态</h3>
            <Badge tone={totals.confirmed === totals.members ? "jade" : "neutral"}>
              {totals.confirmed === totals.members ? "全部已核实" : `${totals.confirmed} 人已核实`}
            </Badge>
          </CardHeader>
          <CardBody>
            <BarList items={verification} emptyText="暂无数据" />
            <SectionHint>核实状态由人工维护：未核实 / 待审核并不等于资料错误，只表示尚未完成核实流程。</SectionHint>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-sm font-semibold text-ink">世代人口分布</h3>
          {totals.withGeneration < totals.members && (
            <span className="text-[10px] text-graphite">{totals.members - totals.withGeneration} 人未录世代</span>
          )}
        </CardHeader>
        <CardBody>
          {generations.length === 0 ? (
            <p className="py-3 text-[11px] text-graphite">尚未录入世代号。可在「字辈与分支」中补充，统计会自动按世代汇总。</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-full items-end gap-1.5" style={{ height: 140 }}>
                {generations.map((g) => {
                  const max = Math.max(...generations.map((x) => x.count));
                  const height = Math.max(3, (g.count / max) * 110);
                  return (
                    <div key={g.generationNumber} className="group flex min-w-6 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[9px] tabular-nums text-graphite opacity-0 transition-opacity group-hover:opacity-100">{g.count}</span>
                      <div
                        className="w-full rounded-t bg-navy/80 transition-colors group-hover:bg-gold"
                        style={{ height }}
                        title={`第 ${g.generationNumber} 代：${g.count} 人（${g.withGenerationChar} 人已录字辈）`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex gap-1.5 border-t border-line pt-1.5">
                {generations.map((g) => (
                  <div key={g.generationNumber} className="min-w-6 flex-1 text-center text-[9px] text-graphite">
                    {g.generationNumber}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[10px] text-ink-soft">横轴为世代号，纵轴为人数；悬停可看该代已录字辈的人数</p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="font-serif text-sm font-semibold text-ink">生卒时间分布</h3>
          </CardHeader>
          <CardBody>
            {decades.length === 0 ? (
              <p className="py-3 text-[11px] text-graphite">尚无可解析的生卒年份。</p>
            ) : (
              <>
                <div className="flex items-end gap-0.5" style={{ height: 120 }}>
                  {decades.map((d) => {
                    const birthHeight = Math.max(0, (d.births / maxDecade) * 100);
                    const deathHeight = Math.max(0, (d.deaths / maxDecade) * 100);
                    return (
                      <div key={d.decade} className="group flex min-w-2 flex-1 flex-col justify-end" title={`${d.decade}s：出生 ${d.births} · 去世 ${d.deaths}`}>
                        <div className="flex items-end justify-center gap-px">
                          {birthHeight > 0 && <div className="w-1/2 rounded-t-sm bg-jade" style={{ height: birthHeight }} />}
                          {deathHeight > 0 && <div className="w-1/2 rounded-t-sm bg-graphite/40" style={{ height: deathHeight }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-graphite">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-jade" />出生</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-graphite/40" />去世</span>
                  <span className="ml-auto">按十年聚合</span>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-serif text-sm font-semibold text-ink">在世成员年龄分布</h3>
          </CardHeader>
          <CardBody>
            {!livingDetailsIncluded ? (
              <p className="py-3 text-[11px] leading-5 text-graphite">
                在世成员的出生日期默认不公开，因此不提供年龄分布。加入该族谱协作后即可查看。
              </p>
            ) : livingAges.length === 0 ? (
              <p className="py-3 text-[11px] text-graphite">在世成员缺少可用的出生年份，无法计算年龄。</p>
            ) : (
              <BarList
                items={livingAges.map((a) => ({ key: a.range, label: `${a.range} 岁`, count: a.count }))}
                emptyText="暂无数据"
              />
            )}
            <SectionHint>
              {livingDetailsIncluded
                ? "仅统计「标记为在世」且填了出生年份的人物；未填出生年的人不计入，因此不会给出估算年龄。"
                : "公开族谱对非协作者只展示在世成员的姓名与世代，统计同样遵循这条边界。"}
            </SectionHint>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="font-serif text-sm font-semibold text-ink">分支人数</h3>
          </CardHeader>
          <CardBody>
            <BarList
              items={branches.map((b) => ({ key: b.id ?? "ungrouped", label: b.name, count: b.count }))}
              emptyText="尚未划分分支"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-sm font-semibold text-ink">字辈用字</h3>
            {generationChars.length > 0 && <Badge tone="gold">{generationChars.length} 字</Badge>}
          </CardHeader>
          <CardBody>
            {generationChars.length === 0 ? (
              <p className="py-3 text-[11px] text-graphite">尚未录入字辈用字。</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {generationChars.slice(0, 40).map((c) => (
                    <span
                      key={c.char}
                      className="inline-flex items-center gap-1 rounded border border-line bg-cream/60 px-2 py-1 font-serif text-sm text-ink"
                      title={`${c.char}：${c.count} 人`}
                    >
                      {c.char}
                      <span className="font-sans text-[10px] tabular-nums text-graphite">{c.count}</span>
                    </span>
                  ))}
                </div>
                <SectionHint>字辈只用人工确认后录入的字段统计，不按姓名自动推断。</SectionHint>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

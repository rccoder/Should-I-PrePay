import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { SCENARIO_COLORS, STATUS_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'
import { deriveMilestones, type Milestone } from '@/engine/milestones'
import type { AnalysisResult, ScenarioDef, Warning, WarningKind } from '@/engine/types'

const LIFE_META = {
  'big-expense': { label: '大额支出', color: 'var(--chart-slot-2)' },
  'big-income': { label: '大额收入', color: 'var(--chart-slot-3)' },
  invest: { label: '年度定投', color: 'var(--chart-slot-1)' },
} as const

const RISK_META: Record<WarningKind, { label: string; color: string }> = {
  broken: { label: '资金断裂', color: STATUS_COLORS.danger },
  'stress-broken': { label: '资金断裂', color: STATUS_COLORS.danger },
  'market-drawdown': { label: '理财年度回撤', color: STATUS_COLORS.danger },
  'offset-shortfall': { label: '公积金不足 → 活钱补', color: STATUS_COLORS.severe },
  'monthly-topup': { label: '开始花理财', color: STATUS_COLORS.severe },
  'prepay-shortfall': { label: '提前还款降挡', color: STATUS_COLORS.warn },
  'invest-shortfall': { label: '定投降挡', color: STATUS_COLORS.warn },
  'expense-shortfall': { label: '大额支出不足', color: STATUS_COLORS.severe },
}

const isCommonMilestone = (milestone: Milestone) =>
  milestone.label.startsWith('收入降至') ||
  milestone.label.startsWith('公积金') ||
  milestone.label.startsWith('退休')

/** 多方案时间轴：共享日历在上，每个方案一个大轨道，内部再分计划 / 转折 / 风险。 */
export function TimelineEditor({ horizon, result }: { horizon: number; result: AnalysisResult }) {
  const global = useAppStore((s) => s.global)
  const lifeEvents = useAppStore((s) => s.lifeEvents)
  const scenarios = useAppStore((s) => s.scenarios)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const setActiveScenario = useAppStore((s) => s.setActiveScenario)
  const fund = useAppStore((s) => s.fund)
  const loans = useAppStore((s) => s.loans)
  const incomes = useAppStore((s) => s.incomes)
  const { startYear, startMonth } = global

  const allMilestones = useMemo(() => {
    const options = { global, fund, loans, incomes }
    return Object.fromEntries(scenarios.map((scenario) => {
      const outcome = result.outcomes[scenario.id]
      return [scenario.id, outcome ? deriveMilestones(outcome, options) : []]
    })) as Record<string, Milestone[]>
  }, [result, scenarios, global, fund, loans, incomes])

  const commonMilestones = allMilestones[result.baselineId]?.filter(isCommonMilestone) ?? []
  const totalYears = Math.ceil(horizon / 12)
  const stepYears = Math.max(1, Math.ceil(totalYears / 8))
  const ticks = Array.from({ length: Math.floor(totalYears / stepYears) + 1 }, (_, i) => {
    const year = i * stepYears
    return { year, pct: ((year * 12) / horizon) * 100 }
  })
  const gridStyle = {
    backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px)',
    backgroundSize: `${((stepYears * 12) / horizon) * 100}% 100%`,
  }
  const pointTitle = (label: string, m: number, detail?: string) =>
    `${label} · ${monthIndexToLabel(m, startYear, startMonth)}${detail ? `\n${detail}` : ''}`

  return (
    <div className="select-none">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">图例：</span>
        <span>圆点＝计划</span><span>菱形＝关键转折</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-foreground" />风险·预期</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full border-2 border-foreground" />风险·压力</span>
        <span>黄＝降挡，橙＝需动用理财，红＝资金断裂</span>
      </div>

      <div className="relative h-5 border-b">
        {ticks.map(({ year, pct }) => (
          <div key={year} className="absolute top-0 h-full" style={{ left: `${pct}%` }}>
            <div className="h-2 w-px bg-border" />
            <span className="absolute left-0.5 top-2 whitespace-nowrap text-[10px] text-muted-foreground">
              {year === 0 ? '现在' : `${startYear + year}年`}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded-md border bg-muted/25 px-2 py-1.5">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">共同日历（所有方案相同）</p>
        <TrackRow label="人生计划" gridStyle={gridStyle}>
          {stackMarkers(lifeEvents).map(({ item: event, stack }) => (
            <PlanMarker key={event.id} m={event.monthIndex} horizon={horizon} color={LIFE_META[event.type].color}
              title={pointTitle(event.type === 'invest' ? `每年定投（${event.monthOfYear}月）` : event.label, event.monthIndex, formatMoney(event.amount))}
              repeatable={event.type === 'invest'} stack={stack} />
          ))}
        </TrackRow>
        <TrackRow label="共同转折" gridStyle={gridStyle}>
          {commonMilestones.map((milestone, index) => (
            <MilestoneMarker key={`${milestone.label}-${index}`} m={milestone.m} horizon={horizon} label={milestone.label}
              title={pointTitle(milestone.label, milestone.m)} />
          ))}
        </TrackRow>
      </div>

      <div className="mt-3 space-y-3">
        {scenarios.map((scenario) => {
          const outcome = result.outcomes[scenario.id]
          return <ScenarioLane key={scenario.id} scenario={scenario} horizon={horizon} gridStyle={gridStyle}
            milestones={(allMilestones[scenario.id] ?? []).filter((m) => !isCommonMilestone(m))}
            baseWarnings={outcome?.base.warnings ?? []} stressWarnings={outcome?.stress.warnings ?? []} pointTitle={pointTitle}
            lastPayoff={outcome ? Math.max(...Object.values(outcome.metrics.payoffMonthByLoan)) : Infinity}
            active={activeScenarioId === scenario.id}
            onSelect={() => setActiveScenario(activeScenarioId === scenario.id ? null : scenario.id)} />
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">每个方案分别展示：还款计划、结果转折与风险。风险节点只标首次触发；悬停可看月份和原因。</p>
    </div>
  )
}

function ScenarioLane({ scenario, horizon, gridStyle, milestones, baseWarnings, stressWarnings, pointTitle, lastPayoff, active, onSelect }: {
  scenario: ScenarioDef; horizon: number; gridStyle: React.CSSProperties; milestones: Milestone[]
  baseWarnings: Warning[]; stressWarnings: Warning[]; pointTitle: (label: string, m: number, detail?: string) => string; lastPayoff: number
  active: boolean; onSelect: () => void
}) {
  const color = SCENARIO_COLORS[scenario.colorSlot]
  const stressOnly = stressWarnings.filter((warning) => !baseWarnings.some((base) => base.kind === warning.kind && base.m === warning.m))
  const terminalMonth = [...baseWarnings, ...stressWarnings]
    .filter((warning) => warning.kind === 'broken' || warning.kind === 'stress-broken')
    .reduce<number | null>((min, warning) => min === null ? warning.m : Math.min(min, warning.m), null)
  const eventEnd = terminalMonth === null ? lastPayoff : Math.min(lastPayoff, terminalMonth)
  const visibleEvents = scenario.events.filter((event) => event.monthIndex <= eventEnd)
  const visibleMilestones = terminalMonth === null ? milestones : milestones.filter((milestone) => milestone.m <= terminalMonth)
  const visibleBaseWarnings = terminalMonth === null ? baseWarnings : baseWarnings.filter((warning) => warning.m <= terminalMonth)
  const visibleStressWarnings = terminalMonth === null ? stressOnly : stressOnly.filter((warning) => warning.m <= terminalMonth)
  return <section
    className={`cursor-pointer rounded-lg border transition-colors hover:bg-accent/30 ${active ? 'bg-accent/40 ring-1 ring-foreground/15' : ''}`}
    style={{ borderLeftWidth: 3, borderLeftColor: color }}
    role="button"
    tabIndex={0}
    aria-pressed={active}
    title="点击选中该方案，供结论与盈亏平衡分析使用"
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect()
      }
    }}
  >
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2.5 py-1.5 text-xs">
      <span className="font-medium" style={{ color }}>{scenario.name}</span>
      <span className="text-[10px] text-muted-foreground">预期风险 {baseWarnings.length} · 压力新增 {stressOnly.length}</span>
      {terminalMonth !== null && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">模拟于 {pointTitle('资金链断裂', terminalMonth).replace('资金链断裂 · ', '')} 终止：资金链断裂</span>}
    </div>
    <div className="px-2.5 py-1">
      <TrackRow label="还款计划" dotColor={color} gridStyle={gridStyle}>
        {stackMarkers(visibleEvents).map(({ item: event, stack }) => <PlanMarker key={event.id} m={event.monthIndex} horizon={horizon} color={color} repeatable={Boolean(event.repeat)} stack={stack}
          title={pointTitle(event.source === 'fund' ? '公积金年冲' : '额外提前还款', event.monthIndex, event.amount < 0 ? '使用公积金账户全部余额' : formatMoney(event.amount))} />)}
      </TrackRow>
      <TrackRow label="结果转折" gridStyle={gridStyle}>
        {visibleMilestones.filter((m) => m.tone === 'good').map((milestone, index) => <MilestoneMarker key={`${milestone.label}-${index}`} m={milestone.m} horizon={horizon} label={milestone.label} title={pointTitle(milestone.label, milestone.m)} />)}
      </TrackRow>
      <TrackRow label="风险预警" gridStyle={gridStyle}>
        {stackMarkers(visibleBaseWarnings).map(({ item: warning, stack }, index) => <RiskMarker key={`base-${warning.kind}-${index}`} warning={warning} horizon={horizon} stack={stack} title={pointTitle(RISK_META[warning.kind].label, warning.m, warning.detail)} />)}
        {stackMarkers(visibleStressWarnings).map(({ item: warning, stack }, index) => <RiskMarker key={`stress-${warning.kind}-${index}`} warning={warning} horizon={horizon} stress stack={stack} title={pointTitle(`压力：${RISK_META[warning.kind].label}`, warning.m, warning.detail)} />)}
        {visibleBaseWarnings.length === 0 && visibleStressWarnings.length === 0 && <EmptyHint text="预期与压力情形均未触发风险" />}
      </TrackRow>
    </div>
  </section>
}

function TrackRow({ label, dotColor, gridStyle, children }: { label: string; dotColor?: string; gridStyle: React.CSSProperties; children: React.ReactNode }) {
  return <div className="flex items-start gap-2 border-b py-1.5 last:border-b-0"><span className="w-20 shrink-0 pt-0.5 text-[10px] text-muted-foreground">{dotColor && <i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />}{label}</span><div className="relative h-7 flex-1 rounded bg-muted/60" style={gridStyle}>{children}</div></div>
}
function pct(m: number, horizon: number) { return `${Math.min(99.5, Math.max(0.5, (m / horizon) * 100))}%` }
function PlanMarker({ m, horizon, color, title, repeatable, stack = 0 }: { m: number; horizon: number; color: string; title: string; repeatable?: boolean; stack?: number }) {
  return <span title={title} aria-label={title} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-help" style={{ left: pct(m, horizon), top: `calc(50% + ${stack * 8}px)` }}><i className="block h-3.5 w-3.5 rounded-full border-2 border-background shadow" style={{ backgroundColor: color }} />{repeatable && <i className="absolute -right-1 -top-1 block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}</span>
}
function MilestoneMarker({ m, horizon, label, title }: { m: number; horizon: number; label: string; title: string }) {
  return <span title={title} aria-label={title} className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-help" style={{ left: pct(m, horizon) }}><i className="block h-3 w-3 rotate-45 border border-background shadow" style={{ backgroundColor: STATUS_COLORS.good }} /><span className="absolute left-1/2 top-4 max-w-20 -translate-x-1/2 truncate whitespace-nowrap text-[9px] text-muted-foreground">{label}</span></span>
}
function RiskMarker({ warning, horizon, stress, title, stack = 0 }: { warning: Warning; horizon: number; stress?: boolean; title: string; stack?: number }) {
  const meta = RISK_META[warning.kind]
  return <span title={title} aria-label={title} className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-help" style={{ left: pct(warning.m, horizon), top: `calc(50% + ${stack * 8}px)` }}><i className={`block h-3.5 w-3.5 rounded-full shadow ${stress ? 'border-2 bg-background' : 'border-2 border-background'}`} style={{ borderColor: stress ? meta.color : undefined, backgroundColor: stress ? undefined : meta.color }} /><span className="absolute left-1/2 top-4 max-w-24 -translate-x-1/2 truncate whitespace-nowrap text-[9px]" style={{ color: meta.color }}>{meta.label}</span></span>
}
function EmptyHint({ text }: { text: string }) { return <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground/60">{text}</span> }

function stackMarkers<T extends { monthIndex?: number; m?: number }>(items: T[]): Array<{ item: T; stack: number }> {
  const seen = new Map<number, number>()
  return items.map((item) => {
    const month = item.monthIndex ?? item.m ?? 0
    const index = seen.get(month) ?? 0
    seen.set(month, index + 1)
    return { item, stack: index % 2 === 0 ? Math.ceil(index / 2) : -Math.ceil(index / 2) }
  })
}

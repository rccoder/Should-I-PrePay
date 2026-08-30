import { Fragment } from 'react'
import type { AnalysisResult, GlobalParams, ScenarioDef, ScenarioOutcome } from '@/engine/types'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'

/** 多方案横向对比表（图/表互补通道，无障碍兜底） */
export function ComparisonTable({
  result,
  scenarios,
  global,
  stress = false,
}: {
  result: AnalysisResult
  scenarios: Array<Pick<ScenarioDef, 'id' | 'name' | 'colorSlot' | 'events'>>
  global: GlobalParams
  stress?: boolean
}) {
  const baseline = result.outcomes[result.baselineId]
  const metricOf = (id: string) => stress ? result.outcomes[id]?.stressMetrics : result.outcomes[id]?.metrics
  const rows: Array<{
    label: string
    render: (id: string) => string
    tone?: (id: string) => string | undefined
  }> = [
    {
      label: '累计支付利息',
      render: (id) => formatMoney(metricOf(id)?.totalInterest ?? NaN),
    },
    {
      label: '总还款额',
      render: (id) => formatMoney(metricOf(id)?.totalPaid ?? NaN),
    },
    {
      label: '期末净资产',
      render: (id) => formatMoney(metricOf(id)?.endNetWorth ?? NaN),
    },
    {
      label: '宽心指数',
      render: (id) => String(result.outcomes[id]?.score.score ?? '—'),
    },
    {
      label: '流动性变化',
      render: (id) => {
        const outcome = result.outcomes[id]
        if (!outcome || !baseline) return '—'
        if (id === result.baselineId) return `${outcome.score.currentCoverage.toFixed(0)} 个月（基准）`
        return `${baseline.score.currentCoverage.toFixed(0)} → ${outcome.score.currentCoverage.toFixed(0)} 个月`
      },
    },
    {
      label: '月冲状态',
      render: (id) => {
        const scenario = scenarios.find((item) => item.id === id)
        const warning = result.outcomes[id]?.base.warnings.find((item) => item.kind === 'offset-shortfall')
        if (!warning) return '公积金持续覆盖房贷'
        const date = monthIndexToLabel(warning.m, global.startYear, global.startMonth)
        const prefix = scenario?.id !== result.baselineId && scenario?.events.some((event) => event.source === 'fund')
          ? '年冲后，'
          : ''
        return `${prefix}${date}起活钱补${formatMoney(warning.amount ?? 0)}/月`
      },
      tone: (id) => result.outcomes[id]?.base.warnings.some((item) => item.kind === 'offset-shortfall') ? 'text-status-severe' : 'text-status-good',
    },
    {
      label: '还清时间',
      render: (id) => {
        const outcome = result.outcomes[id]
        if (!outcome) return '—'
        const payoffs = Object.values(metricOf(id)?.payoffMonthByLoan ?? {})
        const last = payoffs.length > 0 ? Math.max(...payoffs) : Infinity
        return Number.isFinite(last)
          ? monthIndexToLabel(last, global.startYear, global.startMonth)
          : '模拟期内未还清'
      },
    },
    {
      label: '结论',
      render: (id) => id === result.baselineId ? '基准' : verdictFor(result.outcomes[id], baseline).text,
      tone: (id) => id === result.baselineId ? undefined : verdictFor(result.outcomes[id], baseline).tone,
    },
  ]

  return (
    <div className="space-y-2">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2 pr-4 font-normal text-muted-foreground">指标</th>
          {scenarios.map((sc) => (
            <th key={sc.id} className="py-2 pr-4 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: SCENARIO_COLORS[sc.colorSlot] }}
                />
                {sc.name}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <Fragment key={row.label}>
          <tr className="border-b last:border-0">
            <td className="py-2 pr-4 text-xs text-muted-foreground">{row.label}</td>
            {scenarios.map((sc) => (
              <td
                key={sc.id}
                className={`py-2 pr-4 font-mono text-[13px] tabular-nums ${row.tone?.(sc.id) ?? ''}`}
              >
                {row.render(sc.id)}
              </td>
            ))}
          </tr>
          {index === 2 && <OpportunityCostGroup result={result} scenarios={scenarios} stress={stress} />}
          </Fragment>
        ))}
        <tr>
          <td className="py-2 pr-4 text-xs text-muted-foreground">宽心指数带位</td>
          {scenarios.map((sc) => {
            const band = result.outcomes[sc.id]?.score.band
            return (
              <td key={sc.id} className="py-2 pr-4 text-[13px]">
                {band ? BAND_LABEL[band] : '—'}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
    <div className="rounded-md bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">这不是“实际亏损”，而是相对基准的期末资产变化</p>
      <p className="mt-1 leading-relaxed">
        “期末资产变化”= 该方案期末净资产 − 只做月冲方案期末净资产。负数表示在当前模拟终点时，资产比基准少；不代表一次性真的亏掉这笔钱。
        “实际少投定投本金”只统计定投计划在本方案中确实少执行的金额；理财收益变化则按两个方案真实理财账户的逐月余额计算，长期终点下会受到复利放大。
      </p>
    </div>
    </div>
  )
}

function OpportunityCostGroup({ result, scenarios, stress }: { result: AnalysisResult; scenarios: Array<Pick<ScenarioDef, 'id' | 'name' | 'colorSlot' | 'events'>>; stress: boolean }) {
  const metricOf = (id: string) => stress ? result.outcomes[id]?.stressMetrics : result.outcomes[id]?.metrics
  const items = [
    { label: '期末资产变化（相对基准）', pick: (id: string) => metricOf(id)?.realSavingVsBaseline ?? 0 },
    { label: '少付贷款利息', pick: (id: string) => metricOf(id)?.nominalInterestSaving ?? 0 },
    { label: '公积金利息变化', pick: (id: string) => metricOf(id)?.fundInterestDeltaVsBaseline ?? 0 },
    { label: '实际少投定投本金', pick: (id: string) => metricOf(id)?.investPrincipalShortfallVsBaseline ?? 0 },
    { label: '理财收益变化（实际账户路径）', pick: (id: string) => metricOf(id)?.wealthReturnDeltaVsBaseline ?? 0 },
    { label: '其他现金流差异', pick: (id: string) => metricOf(id)?.otherAssetPathDelta ?? 0 },
  ]
  return <tr className="border-b bg-muted/25 align-top"><td className="py-2 pr-4 text-xs"><p className="mb-1 font-medium text-foreground">收益与机会成本</p>{items.map((item, index) => <p key={item.label} className={`leading-6 ${index === 0 ? 'text-foreground' : 'pl-2 text-muted-foreground'}`}>{index === 0 ? item.label : `↳ ${item.label}`}</p>)}</td>{scenarios.map((scenario) => <td key={scenario.id} className="py-2 pr-4 font-mono text-[13px] tabular-nums">{items.map((item, index) => { const value = item.pick(scenario.id); const baseline = scenario.id === result.baselineId; return <p key={item.label} className={`leading-6 ${index === 0 ? `font-semibold ${baseline ? '' : valueTone(value)}` : baseline ? 'text-muted-foreground' : valueTone(value)}`}>{baseline ? (index === 0 ? '基准' : '—') : formatSigned(value)}</p> })}</td>)}</tr>
}

function formatSigned(value: number) {
  return `${value > 0 ? '+' : ''}${formatMoney(value)}`
}

function valueTone(value: number) {
  return value > 0 ? 'text-status-good' : value < 0 ? 'text-status-danger' : 'text-muted-foreground'
}

function verdictFor(target: ScenarioOutcome | undefined, baseline: ScenarioOutcome | undefined) {
  if (!target || !baseline) return { text: '—', tone: undefined }
  const real = target.metrics.realSavingVsBaseline
  const brokeBase = target.score.brokeFromBase !== null
  const brokeStress = target.score.brokeMonthsStress > 0 && !brokeBase
  if (brokeBase) return { text: '不能这样还', tone: 'text-status-danger' }
  if (real > 1000 && !brokeStress) return { text: '值得还', tone: 'text-status-good' }
  if (real > 1000) return { text: '可还，但抗风险变弱', tone: 'text-status-warn' }
  if (real < -1000) return { text: '不建议还', tone: 'text-status-danger' }
  return { text: '差别不大', tone: 'text-status-warn' }
}

const BAND_LABEL: Record<string, string> = {
  stable: '安稳',
  comfortable: '舒适',
  tense: '紧张',
  anxious: '焦虑',
  danger: '危险',
}

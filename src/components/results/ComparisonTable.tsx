import type { AnalysisResult, GlobalParams, ScenarioDef, ScenarioOutcome } from '@/engine/types'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'

/** 多方案横向对比表（图/表互补通道，无障碍兜底） */
export function ComparisonTable({
  result,
  scenarios,
  global,
}: {
  result: AnalysisResult
  scenarios: Array<Pick<ScenarioDef, 'id' | 'name' | 'colorSlot' | 'events'>>
  global: GlobalParams
}) {
  const baseline = result.outcomes[result.baselineId]
  const rows: Array<{
    label: string
    render: (id: string) => string
    tone?: (id: string) => string | undefined
  }> = [
    {
      label: '累计支付利息',
      render: (id) => formatMoney(result.outcomes[id]?.metrics.totalInterest ?? NaN),
    },
    {
      label: '总还款额',
      render: (id) => formatMoney(result.outcomes[id]?.metrics.totalPaid ?? NaN),
    },
    {
      label: '期末净资产',
      render: (id) => formatMoney(result.outcomes[id]?.metrics.endNetWorth ?? NaN),
    },
    {
      label: '最终多赚/少赚（含机会成本）',
      render: (id) => {
        const v = result.outcomes[id]?.metrics.realSavingVsBaseline
        return id === result.baselineId ? '基准' : formatMoney(v ?? NaN)
      },
      tone: (id) => {
        const v = result.outcomes[id]?.metrics.realSavingVsBaseline ?? 0
        return v > 0 ? 'text-status-good' : v < 0 ? 'text-status-danger' : undefined
      },
    },
    {
      label: '名义少付利息',
      render: (id) => {
        const v = result.outcomes[id]?.metrics.nominalInterestSaving
        return id === result.baselineId ? '—' : formatMoney(v ?? NaN)
      },
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
        const payoffs = Object.values(outcome.metrics.payoffMonthByLoan)
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
        {rows.map((row) => (
          <tr key={row.label} className="border-b last:border-0">
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
      <p className="font-medium text-foreground">“含机会成本”到底是什么？</p>
      <p className="mt-1 leading-relaxed">
        它不是额外扣掉的一笔钱。提前还贷后，原来会继续留在公积金账户或理财账户里的钱，未来少产生的收益，就是机会成本。
        所以最终多赚/少赚 = 少付贷款利息 + 公积金利息变化 + 理财收益变化 + 其他差异。
      </p>
      <PathBreakdown result={result} scenarios={scenarios} />
    </div>
    </div>
  )
}

function PathBreakdown({ result, scenarios }: { result: AnalysisResult; scenarios: Array<Pick<ScenarioDef, 'id' | 'name' | 'colorSlot' | 'events'>> }) {
  const rows = [
    { label: '① 少付贷款利息（提前还贷的好处）', pick: (id: string) => result.outcomes[id]?.metrics.nominalInterestSaving ?? 0 },
    { label: '② 公积金利息变化（机会成本的一部分）', pick: (id: string) => result.outcomes[id]?.metrics.fundInterestDeltaVsBaseline ?? 0 },
    { label: '③ 理财收益变化（机会成本的一部分）', pick: (id: string) => result.outcomes[id]?.metrics.wealthReturnDeltaVsBaseline ?? 0 },
    { label: '④ 其他现金流差异（如计划未全额执行）', pick: (id: string) => result.outcomes[id]?.metrics.otherAssetPathDelta ?? 0 },
    { label: '= 最终多赚/少赚（含机会成本）', pick: (id: string) => result.outcomes[id]?.metrics.realSavingVsBaseline ?? 0 },
  ]
  return <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-[11px]"><thead><tr className="border-b"><th className="py-1.5 text-left font-normal">怎么算</th>{scenarios.map((scenario) => <th key={scenario.id} className="py-1.5 text-left font-normal">{scenario.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-b last:border-0"><td className="py-1.5">{row.label}</td>{scenarios.map((scenario) => <td key={scenario.id} className="py-1.5 font-mono tabular-nums">{scenario.id === result.baselineId ? '基准' : formatSigned(row.pick(scenario.id))}</td>)}</tr>)}</tbody></table></div>
}

function formatSigned(value: number) {
  return `${value > 0 ? '+' : ''}${formatMoney(value)}`
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

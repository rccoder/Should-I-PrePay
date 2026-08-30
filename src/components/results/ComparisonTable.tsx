import type { AnalysisResult, GlobalParams, ScenarioOutcome } from '@/engine/types'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'

/** 多方案横向对比表（图/表互补通道，无障碍兜底） */
export function ComparisonTable({
  result,
  scenarios,
  global,
}: {
  result: AnalysisResult
  scenarios: Array<{ id: string; name: string; colorSlot: 1 | 2 | 3 | 4 }>
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
      label: '真实节省（含机会成本）',
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
      label: '放弃理财收益',
      render: (id) => {
        if (id === result.baselineId) return '—'
        const metrics = result.outcomes[id]?.metrics
        return metrics ? formatMoney(Math.max(0, metrics.nominalInterestSaving - metrics.realSavingVsBaseline)) : '—'
      },
      tone: (id) => id === result.baselineId ? undefined : 'text-status-severe',
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
  )
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

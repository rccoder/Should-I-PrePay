import type { AnalysisResult, GlobalParams } from '@/engine/types'
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
      label: '宽心指数',
      render: (id) => String(result.outcomes[id]?.score.score ?? '—'),
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

const BAND_LABEL: Record<string, string> = {
  stable: '安稳',
  comfortable: '舒适',
  tense: '紧张',
  anxious: '焦虑',
  danger: '危险',
}

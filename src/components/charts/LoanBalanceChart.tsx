import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMemo } from 'react'
import type { AnalysisResult, ScenarioDef } from '@/engine/types'
import type { ViewMode } from '@/store/useAppStore'
import { CHART_STYLE } from '@/config/chart-theme'
import {
  buildTimeRows,
  lineProps,
  moneyTooltipFormatter,
  scenarioSeries,
} from './chartPrimitives'

/**
 * 贷款余额曲线：每方案一条（两笔贷款合计），多方案叠加。
 * 商贷/公积金贷分色堆叠在 M3 细化，先给总量对比。
 */
export function LoanBalanceChart({
  result,
  scenarios,
  startYear,
  startMonth,
}: {
  result: AnalysisResult
  scenarios: ScenarioDef[]
  startYear: number
  startMonth: number
  viewMode: ViewMode
}) {
  const series = scenarioSeries(scenarios)
  const rows = useMemo(
    () =>
      buildTimeRows(
        result,
        series,
        (s) => s.loans.reduce((acc, l) => acc + l.balance, 0),
        { startYear, startMonth },
      ),
    // series 由 scenarios 稳定派生
    [result, scenarios, startYear, startMonth],
  )

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={CHART_STYLE.gridStroke} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={48}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
        />
        <Tooltip formatter={moneyTooltipFormatter} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((meta) => (
          <Line {...lineProps(meta)} key={meta.id} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
 * 流动资产曲线（活钱+理财池，不含被锁定的公积金）：
 * 收入断崖后的下降段、压力情形虚线在此图最直观。
 */
export function LiquidityChart({
  result,
  scenarios,
  startYear,
  startMonth,
  viewMode,
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
        (s) => s.cash + Object.values(s.pools).reduce((a, b) => a + b, 0),
        { startYear, startMonth, includeStress: true },
      ),
    [result, scenarios, startYear, startMonth],
  )
  const showBase = viewMode !== 'stress'
  const showStress = viewMode !== 'expected'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
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
        {showBase &&
          series.map((meta) => (
            <Area
              key={meta.id}
              dataKey={meta.id}
              name={meta.name}
              stroke={meta.color}
              strokeWidth={CHART_STYLE.lineWidth}
              fill={meta.color}
              fillOpacity={CHART_STYLE.areaFillOpacity}
              isAnimationActive={false}
            />
          ))}
        {showStress &&
          series.map((meta) => (
            <Line
              {...lineProps({ ...meta, dashed: true }, `${meta.id}__stress`)}
              key={`${meta.id}-s`}
            />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

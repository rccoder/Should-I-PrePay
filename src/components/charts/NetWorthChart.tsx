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
import type { AnalysisResult, ScenarioDef } from '@/engine/types'
import type { ViewMode } from '@/store/useAppStore'
import { CHART_STYLE } from '@/config/chart-theme'
import {
  buildTimeRows,
  lineProps,
  moneyTooltipFormatter,
  scenarioSeries,
  type SeriesMeta,
} from './chartPrimitives'

const stressKey = (id: string) => `${id}__stress`

/**
 * 净资产演化（核心图）：多方案叠加。
 * - 预期：实线（基准色）
 * - 压力：虚线（同方案色系——虚线语义=「另一情形」）
 * - 叠加：实线 + 虚线并列
 */
export function NetWorthChart({
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
  const rows = buildTimeRows(
    result,
    series,
    (s) => s.netWorth,
    { startYear, startMonth, includeStress: true },
  )
  const showBase = viewMode !== 'stress'
  const showStress = viewMode !== 'expected'

  return (
    <ResponsiveContainer width="100%" height={280}>
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
        {showBase &&
          series.map((meta: SeriesMeta) => (
            <Line {...lineProps(meta)} key={meta.id} />
          ))}
        {showStress &&
          series.map((meta) => (
            <Line
              {...lineProps({ ...meta, dashed: true }, stressKey(meta.id))}
              key={`${meta.id}-s`}
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

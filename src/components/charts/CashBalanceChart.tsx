import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMemo } from 'react'
import type { AnalysisResult, ScenarioDef } from '@/engine/types'
import type { ViewMode } from '@/store/useAppStore'
import { STATUS_COLORS } from '@/config/chart-theme'
import {
  buildTimeRows,
  lineProps,
  moneyTooltipFormatter,
  scenarioSeries,
} from './chartPrimitives'

/** 活钱余额（手里的存款）：日常开销与月供的弹药库；虚线为压力情形 */
export function CashBalanceChart({
  result,
  scenarios,
  startYear,
  startMonth,
  viewMode,
  emergencyReserve,
}: {
  result: AnalysisResult
  scenarios: ScenarioDef[]
  startYear: number
  startMonth: number
  viewMode: ViewMode
  emergencyReserve: number
}) {
  const series = scenarioSeries(scenarios)
  const rows = useMemo(
    () =>
      buildTimeRows(result, series, (s) => s.cash, {
        startYear,
        startMonth,
        includeStress: true,
      }),
    [result, scenarios, startYear, startMonth],
  )
  const showBase = viewMode !== 'stress'
  const showStress = viewMode !== 'expected'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
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
        {emergencyReserve > 0 && (
          <ReferenceLine
            y={emergencyReserve}
            stroke={STATUS_COLORS.warn}
            strokeDasharray="4 4"
            label={{
              value: '应急底线',
              fontSize: 10,
              fill: STATUS_COLORS.warn,
              position: 'insideTopRight',
            }}
          />
        )}
        <ReferenceLine y={0} stroke="var(--border)" />
        {showBase &&
          series.map((meta) => <Line {...lineProps(meta)} key={meta.id} />)}
        {showStress &&
          series.map((meta) => (
            <Line
              {...lineProps({ ...meta, dashed: true }, `${meta.id}__stress`)}
              key={`${meta.id}-s`}
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

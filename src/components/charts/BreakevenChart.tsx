import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BreakevenResult } from '@/engine/types'
import { CHART_STYLE, SCENARIO_COLORS, STATUS_COLORS } from '@/config/chart-theme'
import { formatPercent } from '@/lib/format'

/** 盈亏平衡图：x=理财年化收益率，y=期末资产变化；标临界点与当前预期位置 */
export function BreakevenChart({
  breakeven,
  currentReturn,
  activeColor = SCENARIO_COLORS[2],
}: {
  breakeven: BreakevenResult
  currentReturn: number
  activeColor?: string
}) {
  if (breakeven.rates.length === 0) return null
  const rows = breakeven.rates.map((r, i) => ({
    r,
    pct: (r * 100).toFixed(2),
    saving: Math.round(breakeven.savings[i] ?? 0),
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={CHART_STYLE.gridStroke} vertical={false} />
        <XAxis
          dataKey="pct"
          tick={{ fontSize: 11 }}
          tickLine={false}
          minTickGap={32}
          label={{ value: '理财年化收益率 %', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
        />
        <Tooltip
          formatter={(v: unknown) =>
            typeof v === 'number' ? `${v >= 0 ? '+' : ''}${Math.round(v / 100) / 100} 万元` : ''
          }
          labelFormatter={(l: unknown) => `年化 ${l}%`}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ReferenceLine
          x={(currentReturn * 100).toFixed(2)}
          stroke={STATUS_COLORS.warn}
          strokeDasharray="4 4"
          label={{ value: '当前预期', fontSize: 10, fill: STATUS_COLORS.warn, position: 'top' }}
        />
        <Line
          dataKey="saving"
          name="期末资产变化"
          stroke={activeColor}
          strokeWidth={CHART_STYLE.lineWidth}
          dot={false}
          isAnimationActive={false}
        />
        {/* f(r) 不保证单调：全部穿越点都标注，避免只看第一个得出反向结论 */}
        {breakeven.crossings.map((c, idx) => (
          <ReferenceDot
            key={idx}
            x={(c * 100).toFixed(2)}
            y={0}
            r={5}
            fill={STATUS_COLORS.good}
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: `临界 ${formatPercent(c)}`,
              fontSize: 10,
              fill: STATUS_COLORS.good,
              position: 'top',
            }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

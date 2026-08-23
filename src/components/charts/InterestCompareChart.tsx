import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMemo } from 'react'
import type { AnalysisResult, ScenarioDef } from '@/engine/types'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney } from '@/lib/format'

/** 累计利息 / 总还款额对比（柱状） */
export function InterestCompareChart({
  result,
  scenarios,
}: {
  result: AnalysisResult
  scenarios: ScenarioDef[]
}) {
  const rows = useMemo(
    () =>
      scenarios.map((sc) => {
        const m = result.outcomes[sc.id]?.metrics
        return {
          name: sc.name,
          color: SCENARIO_COLORS[sc.colorSlot],
          利息: Math.round(m?.totalInterest ?? 0),
          总还款: Math.round(m?.totalPaid ?? 0),
        }
      }),
    [result, scenarios],
  )

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
        />
        <Tooltip
          formatter={(v: unknown) =>
            typeof v === 'number' ? formatMoney(v) : ''
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="利息" fill="var(--chart-slot-2)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="总还款" fill="var(--chart-slot-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

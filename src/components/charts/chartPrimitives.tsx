import type { AnalysisResult, MonthSnap } from '@/engine/types'
import { SCENARIO_COLORS, CHART_STYLE, type ColorSlot } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'

/**
 * Recharts 公共封装：数据整形、降采样、折线公共 props。
 */

export interface SeriesMeta {
  id: string
  name: string
  color: string
  /** 压力情形叠加虚线 */
  dashed?: boolean
}

export function scenarioSeries(
  scenarios: Array<{ id: string; name: string; colorSlot: ColorSlot }>,
): SeriesMeta[] {
  return scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    color: SCENARIO_COLORS[s.colorSlot],
  }))
}

export interface TimeRow {
  m: number
  label: string
  [key: string]: number | string
}

const stressKey = (id: string) => `${id}__stress`

/**
 * 从快照序列构建多方案时间序列；超过 maxPoints 时按步长抽样（强制保留末点）。
 */
export function buildTimeRows(
  result: AnalysisResult,
  series: SeriesMeta[],
  pick: (snap: MonthSnap) => number,
  opts: {
    startYear: number
    startMonth: number
    includeStress?: boolean
    maxPoints?: number
  },
): TimeRow[] {
  const { startYear, startMonth, includeStress = false, maxPoints = 360 } = opts
  const first = result.outcomes[series[0]?.id ?? '']
  const n = first?.base.snaps.length ?? 0
  if (n === 0) return []
  const step = Math.max(1, Math.ceil(n / maxPoints))

  const rows: TimeRow[] = []
  for (let i = 0; i < n; i += step) {
    const isLastGap = i + step >= n && i !== n - 1
    const idx = isLastGap ? n - 1 : i
    const row: TimeRow = {
      m: idx,
      label: monthIndexToLabel(idx, startYear, startMonth),
    }
    for (const meta of series) {
      const outcome = result.outcomes[meta.id]
      if (!outcome) continue
      const baseSnap = outcome.base.snaps[idx]
      row[meta.id] = baseSnap ? Math.round(pick(baseSnap)) : 0
      if (includeStress) {
        const stressSnap = outcome.stress.snaps[idx]
        row[stressKey(meta.id)] = stressSnap ? Math.round(pick(stressSnap)) : 0
      }
    }
    rows.push(row)
  }
  return rows
}

/** 折线公共 props（2px、无点、压力虚线） */
export function lineProps(meta: SeriesMeta, dataKey?: string) {
  return {
    dataKey: dataKey ?? meta.id,
    name: meta.dashed ? `${meta.name}（压力）` : meta.name,
    stroke: meta.color,
    strokeWidth: CHART_STYLE.lineWidth,
    dot: false,
    strokeDasharray: meta.dashed ? '6 4' : undefined,
    connectNulls: true,
    isAnimationActive: false,
  } as const
}

/** Recharts Tooltip 的金额格式化（v3 签名中 value 可为 undefined） */
export function moneyTooltipFormatter(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'number' ? formatMoney(v) : String(v ?? '—')
}

export { formatMoney }

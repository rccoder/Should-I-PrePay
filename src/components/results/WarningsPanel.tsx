import { useMemo } from 'react'
import type { AnalysisResult, Warning, WarningKind } from '@/engine/types'
import type { ScenarioDef } from '@/engine/types'
import { STATUS_COLORS } from '@/config/chart-theme'
import { monthIndexToLabel } from '@/lib/format'

const KIND_META: Record<WarningKind, { label: string; level: 'danger' | 'severe' | 'warn' }> = {
  broken: { label: '资金断裂', level: 'danger' },
  'stress-broken': { label: '压力情形断裂', level: 'danger' },
  'offset-shortfall': { label: '公积金月冲不足', level: 'severe' },
  'monthly-topup': { label: '开始动用理财还月供', level: 'severe' },
  'prepay-shortfall': { label: '提前还款降挡', level: 'warn' },
  'invest-shortfall': { label: '定投降挡', level: 'warn' },
  'expense-shortfall': { label: '大额支出资金不足', level: 'severe' },
}

/** 预警汇总：按严重度排序，同类合并计数 */
export function WarningsPanel({
  result,
  scenarios,
  startYear,
  startMonth,
}: {
  result: AnalysisResult
  scenarios: ScenarioDef[]
  startYear: number
  startMonth: number
}) {
  const items = useMemo(() => {
    const out: Array<{
      key: string
      scenarioName: string
      kind: WarningKind
      level: 'danger' | 'severe' | 'warn'
      firstMonth: number
      detail: string
      count: number
      stress: boolean
    }> = []
    for (const sc of scenarios) {
      const outcome = result.outcomes[sc.id]
      if (!outcome) continue
      const all = [
        ...outcome.base.warnings.map((w) => ({ w, stress: false })),
        ...outcome.stress.warnings
          .filter((w) => !outcome.base.warnings.some((b) => b.m === w.m && b.detail === w.detail))
          .map((w) => ({ w, stress: true })),
      ]
      const grouped = new Map<string, { first: number; count: number; sample: Warning; stress: boolean }>()
      for (const { w, stress } of all) {
        const key = `${w.kind}:${stress}`
        const g = grouped.get(key)
        if (g) {
          g.count++
        } else {
          grouped.set(key, { first: w.m, count: 1, sample: w, stress })
        }
      }
      for (const [key, g] of grouped) {
        out.push({
          key: `${sc.id}-${key}`,
          scenarioName: sc.name,
          kind: g.sample.kind,
          level: KIND_META[g.sample.kind].level,
          firstMonth: g.first,
          detail: g.sample.detail,
          count: g.count,
          stress: g.stress,
        })
      }
    }
    const order = { danger: 0, severe: 1, warn: 2 } as const
    return out.sort(
      (a, b) => order[a.level] - order[b.level] || a.firstMonth - b.firstMonth,
    )
  }, [result, scenarios])

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.good }} />
        各方案均未触发预警：预期与压力情形下现金流都能覆盖。
      </p>
    )
  }

  const countBy = (level: 'danger' | 'severe' | 'warn') =>
    items.filter((i) => i.level === level).length

  return (
    <div className="space-y-3">
      {/* 分级汇总 */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(['danger', 'severe', 'warn'] as const).map((level) => {
          const n = countBy(level)
          if (n === 0) return null
          const color =
            level === 'danger'
              ? STATUS_COLORS.danger
              : level === 'severe'
                ? STATUS_COLORS.severe
                : STATUS_COLORS.warn
          const label =
            level === 'danger' ? '严重' : level === 'severe' ? '需要关注' : '提示'
          return (
            <span
              key={level}
              className="rounded-md px-2 py-1 font-medium"
              style={{ backgroundColor: `${color}1c`, color }}
            >
              {label} × {n}
            </span>
          )
        })}
      </div>
      <ul className="space-y-2">
      {items.map((item) => {
        const color =
          item.level === 'danger'
            ? STATUS_COLORS.danger
            : item.level === 'severe'
              ? STATUS_COLORS.severe
              : STATUS_COLORS.warn
        return (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>
              <span className="font-medium" style={{ color }}>
                {KIND_META[item.kind].label}
              </span>
              <span className="text-muted-foreground">
                {' '}
                · {item.scenarioName}
                {item.stress ? '（压力情形）' : ''} · 自{' '}
                {monthIndexToLabel(item.firstMonth, startYear, startMonth)}
                {item.count > 1 ? ` 起，累计 ${item.count} 段/次` : ''}
              </span>
              <span className="block pl-0 text-xs text-muted-foreground">{item.detail}</span>
            </span>
          </li>
        )
      })}
      </ul>
    </div>
  )
}

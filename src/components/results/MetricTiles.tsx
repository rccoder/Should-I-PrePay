import type { AnalysisResult } from '@/engine/types'
import type { GlobalParams, Id } from '@/engine/types'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'

/** 每方案一列指标卡：总利息 / 期末净资产 / 真实节省 / 名义少付利息 / 还清时间 */
export function MetricTiles({
  result,
  scenarios,
  global,
}: {
  result: AnalysisResult
  scenarios: Array<{ id: Id; name: string; colorSlot: 1 | 2 | 3 | 4 }>
  global: GlobalParams
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {scenarios.map((sc) => {
        const outcome = result.outcomes[sc.id]
        if (!outcome) return null
        const { metrics } = outcome
        const baselineId = result.baselineId
        const isBaseline = sc.id === baselineId
        const payoffMonths = Object.values(metrics.payoffMonthByLoan)
        const lastPayoff = payoffMonths.length > 0 ? Math.max(...payoffMonths) : Infinity
        const saving = metrics.realSavingVsBaseline
        return (
          <div
            key={sc.id}
            className="rounded-xl border bg-card p-4 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SCENARIO_COLORS[sc.colorSlot] }}
              />
              <span className="truncate text-sm font-medium">{sc.name}</span>
              {isBaseline && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  基准
                </span>
              )}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="累计利息" value={formatMoney(metrics.totalInterest)} />
              <Row
                label="期末净资产"
                value={formatMoney(metrics.endNetWorth)}
                hint="活钱+理财+公积金−贷款余额；不含房产市值"
              />
              {!isBaseline && (
                <>
                  <Row
                    label="真实节省"
                    value={formatMoney(saving)}
                    className={
                      saving > 0 ? 'text-status-good' : saving < 0 ? 'text-status-danger' : undefined
                    }
                    hint="含机会成本口径"
                  />
                  <Row
                    label="名义少付利息"
                    value={formatMoney(metrics.nominalInterestSaving)}
                    className="text-muted-foreground"
                  />
                </>
              )}
              <Row
                label="还清时间"
                value={
                  Number.isFinite(lastPayoff)
                    ? monthIndexToLabel(lastPayoff, global.startYear, global.startMonth)
                    : '模拟期内未还清'
                }
              />
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function Row({
  label,
  value,
  className,
  hint,
}: {
  label: string
  value: string
  className?: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate font-mono text-sm tabular-nums ${className ?? ''}`}>{value}</dd>
    </div>
  )
}

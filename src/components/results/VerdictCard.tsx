import { useMemo } from 'react'
import type { AnalysisResult, Id } from '@/engine/types'
import type { WealthPool } from '@/engine/types'
import { STATUS_COLORS } from '@/config/chart-theme'
import { formatMoney, formatPercent } from '@/lib/format'

/**
 * 决策结论卡：直白回答「该不该还」。
 * 得到 = 无风险省息（名义利息差）；失去 = 放弃的理财收益 + 流动性锁定；
 * 真实节省 = 两者净效果；临界收益率 r* 对比当前预期收益率。
 */
export function VerdictCard({
  result,
  activeScenarioId,
  pools,
  scenarioName,
}: {
  result: AnalysisResult
  activeScenarioId: Id | null
  pools: WealthPool[]
  scenarioName: (id: Id) => string
}) {
  const currentReturn = useMemo(() => {
    const total = pools.reduce((a, p) => a + p.initialBalance, 0)
    if (total <= 0) return 0
    return pools.reduce((a, p) => a + p.expectedAnnualReturn * p.initialBalance, 0) / total
  }, [pools])

  const candidates = Object.values(result.outcomes).filter(
    (o) => o.scenarioId !== result.baselineId,
  )
  const target =
    (activeScenarioId ? candidates.find((o) => o.scenarioId === activeScenarioId) : undefined) ??
    candidates[0]
  const baseline = result.outcomes[result.baselineId]

  if (!target || !baseline) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-xs">
        新建一个提前还款方案后，这里会直接告诉你「该不该还」。
      </div>
    )
  }

  const m = target.metrics
  const real = m.realSavingVsBaseline
  const nominal = m.nominalInterestSaving
  // 名义省息中真正落袋的部分；差额即被机会成本吃掉的部分
  const opportunityCost = Math.max(0, nominal - real)
  const scoreDrop = baseline.score.score - target.score.score
  const brokeBase = target.score.brokeFromBase !== null
  const brokeStress = target.score.brokeMonthsStress > 0 && target.score.brokeFromBase === null

  const crossing = result.breakeven.crossings[0]

  let verdict: { text: string; color: string }
  if (brokeBase) {
    verdict = { text: '不能这样还 —— 会资金断裂', color: STATUS_COLORS.danger }
  } else if (real > 1000 && !brokeStress) {
    verdict = { text: '值得还', color: STATUS_COLORS.good }
  } else if (real > 1000 && brokeStress) {
    verdict = { text: '可以还，但抗风险变弱', color: STATUS_COLORS.warn }
  } else if (real < -1000) {
    verdict = { text: '不建议还', color: STATUS_COLORS.danger }
  } else {
    verdict = { text: '差别不大，看个人偏好', color: STATUS_COLORS.warn }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">结论 · {scenarioName(target.scenarioId)}</span>
        <span
          className="rounded-md px-2.5 py-1 text-sm font-semibold"
          style={{ backgroundColor: `${verdict.color}1c`, color: verdict.color }}
        >
          {verdict.text}
        </span>
        {crossing !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground">
            盈亏平衡：理财年化超过 <b className="text-foreground">{formatPercent(crossing)}</b>{' '}
            就不该还；你当前预期{' '}
            <b
              style={{
                color:
                  currentReturn < crossing ? STATUS_COLORS.good : STATUS_COLORS.severe,
              }}
            >
              {formatPercent(currentReturn)}
            </b>
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Block title={`得到 · 少付利息 ${formatMoney(nominal)}`} tone="good">
          若一切按计划，少付给银行的钱。这是无风险的「确定收益」。
        </Block>
        <Block title={`失去 · 放弃的理财收益约 ${formatMoney(opportunityCost)}`} tone="severe">
          还进去的钱不能再生息；名义省息扣除这部分才是真实节省{' '}
          <b className={real >= 0 ? 'text-status-good' : 'text-status-danger'}>
            {formatMoney(real)}
          </b>
          。
        </Block>
        <Block
          title={
            scoreDrop > 5
              ? `失去 · 安全感：宽心指数下降 ${scoreDrop} 分`
              : '安全感：基本不变'
          }
          tone={scoreDrop > 5 ? 'danger' : undefined}
        >
          流动资产可覆盖开销从 {baseline.score.currentCoverage.toFixed(0)} 个月 →{' '}
          {target.score.currentCoverage.toFixed(0)} 个月。提前还款的钱拿不回来，
          收入断崖时更被动。
        </Block>
      </div>
    </div>
  )
}

function Block({
  title,
  children,
  tone,
}: {
  title: string
  children: React.ReactNode
  tone?: 'good' | 'severe' | 'danger'
}) {
  const color =
    tone === 'good' ? STATUS_COLORS.good : tone === 'severe' ? STATUS_COLORS.severe : tone === 'danger' ? STATUS_COLORS.danger : undefined
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium" style={color ? { color } : undefined}>
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

import type {
  FundAccount,
  GlobalParams,
  IncomeSegment,
  LoanInput,
  ScenarioOutcome,
} from './types'

/**
 * 关键节点推导：从模拟结果中提取「活钱见底、开始动用理财、资金断裂、
 * 贷款还清、退休、收入断崖」等里程碑，供时间轴展示。纯函数，基于预期情形。
 */

export type MilestoneTone = 'danger' | 'severe' | 'warn' | 'good' | 'info'

export interface Milestone {
  /** 相对模拟起点的月序 */
  m: number
  label: string
  tone: MilestoneTone
}

/** 公积金时间线：缴存截止月与余额处理月（与 simulate 保持同一口径） */
export function fundTimeline(
  global: GlobalParams,
  fund: FundAccount | null,
): { contribUntilM: number; processAtM: number } {
  if (!fund) return { contribUntilM: 0, processAtM: 0 }
  const contribEndM = fund.contributionYears * 12
  const retireM = global.retireYear
    ? Math.max(0, (global.retireYear - global.startYear) * 12)
    : null
  return {
    contribUntilM: Math.min(contribEndM, retireM ?? contribEndM),
    processAtM: retireM ?? contribEndM,
  }
}

export interface DeriveMilestonesOptions {
  global: GlobalParams
  fund: FundAccount | null
  loans: LoanInput[]
  incomes: IncomeSegment[]
}

export function deriveMilestones(
  outcome: ScenarioOutcome,
  opts: DeriveMilestonesOptions,
): Milestone[] {
  const { global, fund, loans, incomes } = opts
  const snaps = outcome.base.snaps
  const milestones: Milestone[] = []
  const relYear = (y: number) => Math.max(0, (y - global.startYear) * 12)

  // 活钱跌破应急底线 / 清零
  const reserve = Math.max(0, global.emergencyReserve ?? 0)
  if (reserve > 0) {
    const hit = snaps.find((s) => s.cash < reserve && s.monthlyOutgo > 0)
    if (hit) milestones.push({ m: hit.m, label: '活钱跌破应急底线', tone: 'warn' })
  }
  const zero = snaps.find((s) => s.cash <= 0.005)
  if (zero) milestones.push({ m: zero.m, label: '活钱清零', tone: 'severe' })

  // 开始动用理财 / 资金断裂（各取首段）
  const topup = outcome.base.warnings.find((w) => w.kind === 'monthly-topup')
  if (topup) milestones.push({ m: topup.m, label: '开始花理财补缺口', tone: 'severe' })
  const broken = outcome.base.warnings.find((w) => w.kind === 'broken')
  if (broken) milestones.push({ m: broken.m, label: '资金断裂', tone: 'danger' })

  // 贷款还清（房贷合计 / 其他贷款合计）
  const housingIds = new Set(loans.filter((l) => l.kind !== 'other').map((l) => l.id))
  let housingPayoff = -1
  let otherPayoff = -1
  for (const [loanId, payoff] of Object.entries(outcome.metrics.payoffMonthByLoan)) {
    if (!Number.isFinite(payoff)) continue
    if (housingIds.has(loanId)) housingPayoff = Math.max(housingPayoff, payoff)
    else otherPayoff = Math.max(otherPayoff, payoff)
  }
  if (housingIds.size > 0 && housingPayoff >= 0) {
    milestones.push({ m: housingPayoff, label: '房贷还清', tone: 'good' })
  }
  if (otherPayoff >= 0) milestones.push({ m: otherPayoff, label: '其他贷款还清', tone: 'good' })

  // 公积金停止缴存 / 到期处理
  const { contribUntilM, processAtM } = fundTimeline(global, fund)
  if (fund && fund.annualContribution > 0 && contribUntilM > 0) {
    milestones.push({ m: contribUntilM, label: '公积金停止缴存', tone: 'info' })
  }
  if (fund && processAtM > 0 && fund.maturityPolicy !== 'hold') {
    milestones.push({
      m: processAtM,
      label:
        fund.maturityPolicy === 'withdrawToWealth' ? '公积金退休取出' : '公积金一次性冲抵',
      tone: 'info',
    })
  }

  // 退休
  if (global.retireYear) {
    milestones.push({
      m: relYear(global.retireYear),
      label: `退休（${global.retireYear}）`,
      tone: 'info',
    })
  }

  // 收入断崖：相邻收入段年收入（薪+奖）降幅 > 25%
  const sortedIncomes = [...incomes].sort((a, b) => a.startYear - b.startYear)
  for (let i = 1; i < sortedIncomes.length; i++) {
    const prevTotal =
      (sortedIncomes[i - 1]!.annualSalary ?? 0) + (sortedIncomes[i - 1]!.annualBonus ?? 0)
    const nextTotal =
      (sortedIncomes[i]!.annualSalary ?? 0) + (sortedIncomes[i]!.annualBonus ?? 0)
    if (prevTotal > 0 && nextTotal < prevTotal * 0.75) {
      milestones.push({
        m: relYear(sortedIncomes[i]!.startYear),
        label: `收入降至${(nextTotal / 10000).toFixed(0)}万/年`,
        tone: 'warn',
      })
    }
  }

  return milestones.sort((a, b) => a.m - b.m)
}

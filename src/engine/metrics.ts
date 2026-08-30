import type { AnalysisInput, Id, ScenarioMetrics, MonthSnap } from './types'

/**
 * 汇总指标。核心口径（见 docs/requirements-and-decisions.md「决策正确性类」）：
 * - 真实节省 = 方案期末净资产 − 基准期末净资产（机会成本口径，统一终点比较）
 * - 名义少付利息 = 基准总利息 − 方案总利息（大众口径，会高估「赚到」）
 */
export function summarizeScenario(
  input: AnalysisInput,
  _scenarioId: Id,
  snaps: MonthSnap[],
  baselineSnaps: MonthSnap[],
): ScenarioMetrics {
  const last = snaps[snaps.length - 1]
  const baselineLast = baselineSnaps[baselineSnaps.length - 1]

  const totalInterest = last?.cumInterest ?? 0
  const totalPaid = last?.cumTotalPaid ?? 0
  const baselineInterest = baselineLast?.cumInterest ?? 0
  const nominalInterestSaving = baselineInterest - totalInterest
  const realSavingVsBaseline = (last?.netWorth ?? 0) - (baselineLast?.netWorth ?? 0)
  const fundInterestDeltaVsBaseline =
    (last?.cumFundInterest ?? 0) - (baselineLast?.cumFundInterest ?? 0)
  const wealthReturnDeltaVsBaseline =
    (last?.cumWealthReturn ?? 0) - (baselineLast?.cumWealthReturn ?? 0)
  const investPrincipalShortfallVsBaseline =
    (baselineLast?.cumInvested ?? 0) - (last?.cumInvested ?? 0)

  const payoffMonthByLoan: Record<Id, number> = {}
  for (const loan of input.loans) {
    // 必须已放款（notStarted=false）且余额归零才算还清——放款前的 0 不算
    const payoff = snaps.find(
      (s) =>
        s.loans.find((l) => l.loanId === loan.id && !l.notStarted && l.balance === 0) !==
        undefined,
    )
    payoffMonthByLoan[loan.id] = payoff ? payoff.m : Infinity
  }

  return {
    totalPaid,
    totalInterest,
    payoffMonthByLoan,
    endNetWorth: last?.netWorth ?? 0,
    realSavingVsBaseline,
    nominalInterestSaving,
    fundInterestDeltaVsBaseline,
    wealthReturnDeltaVsBaseline,
    investPrincipalShortfallVsBaseline,
    otherAssetPathDelta:
      realSavingVsBaseline - nominalInterestSaving - fundInterestDeltaVsBaseline - wealthReturnDeltaVsBaseline,
  }
}

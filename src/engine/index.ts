import type {
  AnalysisInput,
  AnalysisResult,
  Id,
  ScenarioOutcome,
} from './types'
import { computeHorizonMonths, simulateScenario } from './simulate'
import { summarizeScenario } from './metrics'
import { computePeaceScore } from './score'
import { breakevenScan } from './breakeven'

export interface RunAnalysisOptions {
  /** 对哪个方案做盈亏平衡扫描；缺省取第一个非基准方案 */
  breakevenScenarioId?: Id
}

/**
 * 引擎总入口：确定统一终点 → 每方案跑 预期+压力 双情形 → 汇总指标 → 宽心指数 → 盈亏平衡。
 * 全量重算 ≤600 月 × 方案数 × 2 情形，毫秒级（滑块拖动直接调用即可）。
 */
export function runAnalysis(
  input: AnalysisInput,
  options: RunAnalysisOptions = {},
): AnalysisResult {
  const horizon = computeHorizonMonths(input)
  const scenarios = input.scenarios
  const baseline =
    scenarios.find((s) => s.isBaseline) ?? scenarios[0]

  if (!baseline) {
    return {
      horizonMonths: horizon,
      baselineId: '',
      outcomes: {},
      breakeven: { rates: [], savings: [], crossings: [] },
    }
  }

  const baselineBase = simulateScenario(input, baseline, false, horizon)

  const outcomes: Record<Id, ScenarioOutcome> = {}
  for (const sc of scenarios) {
    const base =
      sc.id === baseline.id
        ? baselineBase
        : simulateScenario(input, sc, false, horizon)
    const stress = simulateScenario(input, sc, true, horizon)
    outcomes[sc.id] = {
      scenarioId: sc.id,
      base,
      stress,
      metrics: summarizeScenario(input, sc.id, base.snaps, baselineBase.snaps),
      score: computePeaceScore(base.snaps, stress.snaps),
    }
  }

  const breakevenId =
    options.breakevenScenarioId ??
    scenarios.find((s) => s.id !== baseline.id)?.id
  const breakeven = breakevenId
    ? breakevenScan(input, breakevenId, baseline.id, horizon)
    : { rates: [], savings: [], crossings: [] }

  return {
    horizonMonths: horizon,
    baselineId: baseline.id,
    outcomes,
    breakeven,
  }
}

// ---- 公共 API 汇出 ----
export * from './types'
export { computeHorizonMonths, simulateScenario } from './simulate'
export { effectiveAnnualRate, monthlyRate } from './rate'
export {
  advanceScheduled,
  annuityPayment,
  initLoanState,
  peekScheduled,
  applyPeeked,
  recalcAfterPrepay,
  reanchorOnRateChange,
  solveAnnuityMonths,
} from './loan'
export { expandEvents, lastBoundedOccurrence } from './events'
export { summarizeScenario } from './metrics'
export { bandOf, computePeaceScore, coverageMonths, mapScore } from './score'
export { breakevenScan } from './breakeven'
export {
  defaultScenarios,
  presetFundYearlyPrepay,
  presetCashYearlyPrepay,
  presetNoPrepay,
} from './presets'

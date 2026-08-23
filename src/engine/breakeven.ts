import type { AnalysisInput, BreakevenResult, Id } from './types'
import { simulateScenario } from './simulate'

/**
 * 盈亏平衡扫描：找理财收益率 r* 使 f(r) = NW_方案(r) − NW_基准(r) = 0。
 *
 * f(r) 不保证单调（方案与基准的资金分布不同），因此报告全部穿越点（坑 16）。
 * 扫描时把所有池收益统一覆写为 r、关闭压力（maxLoss=0）。
 */
const SCAN_MIN = 0
const SCAN_MAX = 0.1
const SCAN_STEP = 0.0025
const BISECT_ROUNDS = 12

export function breakevenScan(
  input: AnalysisInput,
  scenarioId: Id,
  baselineId: Id,
  horizon: number,
): BreakevenResult {
  const scenario = input.scenarios.find((s) => s.id === scenarioId)
  const baseline = input.scenarios.find((s) => s.id === baselineId)
  if (!scenario || !baseline || scenario.id === baseline.id) {
    return { rates: [], savings: [], crossings: [] }
  }

  const savingAt = (r: number): number => {
    const overridden: AnalysisInput = {
      ...input,
      pools: input.pools.map((p) => ({
        ...p,
        expectedAnnualReturn: r,
        maxLossPct: 0,
      })),
    }
    const s = simulateScenario(overridden, scenario, false, horizon)
    const b = simulateScenario(overridden, baseline, false, horizon)
    return (s.snaps[s.snaps.length - 1]?.netWorth ?? 0) - (b.snaps[b.snaps.length - 1]?.netWorth ?? 0)
  }

  const rates: number[] = []
  const savings: number[] = []
  for (let r = SCAN_MIN; r <= SCAN_MAX + 1e-9; r += SCAN_STEP) {
    rates.push(r)
    savings.push(savingAt(r))
  }

  const crossings: number[] = []
  for (let k = 0; k < savings.length - 1; k++) {
    const f1 = savings[k] ?? 0
    const f2 = savings[k + 1] ?? 0
    if (f1 === 0) crossings.push(rates[k] ?? 0)
    if (f1 * f2 < 0) {
      let lo = rates[k] ?? 0
      let hi = rates[k + 1] ?? 0
      for (let it = 0; it < BISECT_ROUNDS; it++) {
        const mid = (lo + hi) / 2
        if (savingAt(mid) * f1 <= 0) hi = mid
        else lo = mid
      }
      crossings.push((lo + hi) / 2)
    }
  }
  const lastS = savings[savings.length - 1]
  if (lastS === 0 && rates.length > 0) crossings.push(rates[rates.length - 1] ?? 0)

  return { rates, savings, crossings }
}

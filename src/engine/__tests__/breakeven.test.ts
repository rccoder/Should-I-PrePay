import { describe, expect, it } from 'vitest'
import { breakevenScan } from '../breakeven'
import { runAnalysis } from '../index'
import type { AnalysisInput, PrepayEvent } from '../types'

/**
 * 解析可控的盈亏平衡案例：
 * 基准 = 13 万留在理财池滚存 + 工资正常还贷；方案 = m0 用池里 12 万一次性还清贷款。
 * 还款额以 m=0 供款后余额封顶，精确推导见下方用例内注释；r* ≈ 5.88%
 */
function makeInput(): AnalysisInput {
  const events: PrepayEvent[] = [
    { id: 'p', type: 'prepay', monthIndex: 0, amount: 120_000, effect: 'shorten-term', source: 'wealth', wealthPoolId: 'p' },
  ]
  return {
    global: {
      startYear: 2026,
      startMonth: 1,
      endMode: 'auto',
      inflationEnabled: false,
      inflationRate: 0.025,
      fundMonthlyOffset: true,
      emergencyReserve: 0,
      monthlyTopUpSource: 'cash-only',
    },
    loans: [
      {
        id: 'loan-c',
        name: '商业贷款',
        kind: 'commercial',
        principal: 120_000,
        remainingMonths: 24,
        currentRate: 0.12,
        method: 'annuity',
        rateRules: [],
      },
    ],
    incomes: [
      { id: 'inc-1', startYear: 2026, endYear: 2030, annualSalary: 240_000, annualBonus: 0, bonusMonth: 1 },
    ],
    fixedExpenses: [],
    living: [{ id: 'liv-1', startYear: 2026, endYear: 2035, annualAmount: 24_000 }],
    lifeEvents: [],
    cash: { initialBalance: 0 },
    pools: [
      { id: 'p', name: '理财池', riskLevel: 'low', initialBalance: 130_000, expectedAnnualReturn: 0.03, maxLossPct: 0.01 },
    ],
    fund: null,
    scenarios: [
      { id: 'sc-base', name: '基准', colorSlot: 1, isBaseline: true, events: [] },
      { id: 'sc-prepay', name: '一次还清', colorSlot: 2, isBaseline: false, events },
    ],
  }
}

describe('breakevenScan 盈亏平衡扫描', () => {
  const input = makeInput()
  const horizon = 24
  const be = breakevenScan(input, 'sc-prepay', 'sc-base', horizon)

  it('r=0 时还清更划算（节省>0），r=10% 时不还更划算（节省<0）', () => {
    expect(be.savings[0]).toBeGreaterThan(10_000)
    expect(be.savings[be.savings.length - 1]).toBeLessThan(0)
  })

  it('存在唯一临界点且与解析解一致（≈5.88%）', () => {
    expect(be.crossings).toHaveLength(1)
    // 解析解：事件在 m=0 计划供款之后执行——
    // 方案少付 23 期月供；还款额被供款后余额封顶 B₁ = 120000 − (M − 1200)，
    // 基准池里多出的钱正是 B₁：f(r) = 23M − B₁(1+r/12)^24
    const M = (120000 * 0.01 * Math.pow(1.01, 24)) / (Math.pow(1.01, 24) - 1)
    const b1 = 120_000 - (M - 1_200)
    const gStar = (23 * M) / b1
    const rStar = 12 * (Math.pow(gStar, 1 / 24) - 1)
    expect(Math.abs(be.crossings[0]! - rStar)).toBeLessThan(0.002)
  })

  it('扫描序列长度与步长正确', () => {
    expect(be.rates.length).toBe(41)
    expect(be.rates[0]).toBe(0)
    expect(be.rates[be.rates.length - 1]!).toBeCloseTo(0.1, 8)
  })
})

describe('runAnalysis 端到端组装', () => {
  it('产出全部方案的双情形结果、指标与盈亏平衡', () => {
    const result = runAnalysis(makeInput())
    expect(result.horizonMonths).toBeGreaterThanOrEqual(24)
    expect(result.baselineId).toBe('sc-base')
    expect(Object.keys(result.outcomes).sort()).toEqual(['sc-base', 'sc-prepay'])
    for (const outcome of Object.values(result.outcomes)) {
      expect(outcome.base.snaps.length).toBeGreaterThan(0)
      expect(outcome.stress.snaps.length).toBe(outcome.base.snaps.length)
      expect(Number.isFinite(outcome.metrics.endNetWorth)).toBe(true)
      expect(Number.isFinite(outcome.score.score)).toBe(true)
    }
    expect(result.breakeven.crossings).toHaveLength(1)
    // 基准方案对自身的真实节省恒为 0
    expect(result.outcomes['sc-base']!.metrics.realSavingVsBaseline).toBe(0)
  })
})

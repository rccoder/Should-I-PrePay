import { describe, expect, it } from 'vitest'
import { estimateMonthlyPension, pensionMonthlyAtRetirement } from '../pension'
import type { GlobalParams, IncomeSegment } from '../types'

const global: GlobalParams = {
  startYear: 2026, startMonth: 1, endMode: 'auto', inflationEnabled: false, inflationRate: 0,
  retireYear: 2028, fundMonthlyOffset: true, emergencyReserve: 0, monthlyTopUpSource: 'cash-only',
}
const incomes: IncomeSegment[] = [{ id: 'salary', startYear: 2026, endYear: 2027, annualSalary: 120_000, annualBonus: 0, bonusMonth: 1 }]

describe('退休后养老金三种模式', () => {
  it('通用公式粗估使用收入时间线、缴费年限和个人账户余额', () => {
    // 基础：1 万/月 × 20 年 × 1%=2000；个人账户：(12万×2年×8% + 13.9万)/139。
    const estimate = estimateMonthlyPension({ ...global, retirePensionContributionYears: 20, retirePensionAccountBalance: 139_000 }, incomes)
    expect(estimate).toBeCloseTo(2_000 + 158_200 / 139, 6)
    expect(pensionMonthlyAtRetirement({ ...global, retirePensionMode: 'estimate', retirePensionContributionYears: 20, retirePensionAccountBalance: 139_000 }, incomes)).toBeCloseTo(2_000 + 158_200 / 139, 6)
  })

  it('手填金额优先，或可明确选择不计养老金', () => {
    expect(pensionMonthlyAtRetirement({ ...global, retirePensionMode: 'manual', retirePensionMonthly: 6_000 }, incomes)).toBe(6_000)
    expect(pensionMonthlyAtRetirement({ ...global, retirePensionMode: 'none', retirePensionMonthly: 6_000 }, incomes)).toBe(0)
  })
})

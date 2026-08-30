import type { GlobalParams, IncomeSegment } from './types'

/**
 * 离线养老金粗估：将收入时间线年薪按用户填写的缴费基数上限封顶
 * （通常为参保地社平工资的三倍），再以此近似缴费基数，并假设本人缴费指数约为 1。
 * 基础养老金 ≈ 月平均基数 × 累计缴费年限 × 1%；
 * 个人账户养老金 ≈（已知账户余额 + 未来工资的 8%）÷ 139。
 * 不含地区计发基数、缴费指数、账户利息、过渡性养老金和政策调整，故只能作为规划区间参考。
 */
export function estimateMonthlyPension(global: GlobalParams, incomes: IncomeSegment[]): number {
  if (!global.retireYear) return 0
  const years = Math.max(0, global.retirePensionContributionYears ?? 15)
  const salaryYears: number[] = []
  for (let year = global.startYear; year < global.retireYear; year++) {
    const segment = incomes.find((item) => year >= item.startYear && year <= item.endYear)
    if (segment) salaryYears.push(segment.annualSalary)
  }
  if (salaryYears.length === 0 || years === 0) return 0
  const cap = global.retirePensionContributionBaseCapAnnual
  // 未输入上限时不擅自猜参保地社平工资，只按收入作未封顶的近似。
  const contributionBases = salaryYears.map((salary) => cap && cap > 0 ? Math.min(salary, cap) : salary)
  const monthlyBase = contributionBases.reduce((sum, amount) => sum + amount, 0) / contributionBases.length / 12
  const basic = monthlyBase * years * 0.01
  const futurePersonalAccount = contributionBases.reduce((sum, amount) => sum + amount * 0.08, 0)
  const account = ((global.retirePensionAccountBalance ?? 0) + futurePersonalAccount) / 139
  return Math.max(0, basic + account)
}

export function pensionMonthlyAtRetirement(global: GlobalParams, incomes: IncomeSegment[]): number {
  const mode = global.retirePensionMode ?? (global.retirePensionAnnual ? 'manual' : 'none')
  if (mode === 'none') return 0
  if (mode === 'manual') return global.retirePensionMonthly ?? (global.retirePensionAnnual ?? 0) / 12
  return estimateMonthlyPension(global, incomes)
}

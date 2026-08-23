import type { LoanInput } from './types'

/**
 * 第 m 月（相对模拟起点，0-based）的执行年利率。
 * 利率规则按年生效：yearIndex = floor(m / 12)，取「startAfterYear ≤ yearIndex 中生效年份最新的
 * 一条」作为该阶段的执行利率；无命中规则则用当前执行利率。
 */
export function effectiveAnnualRate(loan: LoanInput, m: number): number {
  const yearIndex = Math.floor(m / 12)
  let rate = loan.currentRate
  let bestStart = -1
  for (const rule of loan.rateRules) {
    if (rule.startAfterYear <= yearIndex && rule.startAfterYear > bestStart) {
      bestStart = rule.startAfterYear
      rate = rule.annualRate
    }
  }
  return rate
}

/** 月利率 */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12
}

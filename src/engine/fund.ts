import type { FundAccount, GlobalParams } from './types'

/** 第 m 月所属的日历年份。 */
export function calendarYearAt(global: GlobalParams, m: number): number {
  return global.startYear + Math.floor((global.startMonth - 1 + m) / 12)
}

/** 对应日历年的公积金年缴存额；未覆盖的年份为 0。 */
export function fundAnnualContributionAt(
  fund: FundAccount,
  calendarYear: number,
): number {
  return fund.contributionSegments?.find(
    (segment) => calendarYear >= segment.startYear && calendarYear <= segment.endYear,
  )?.annualAmount ?? fund.annualContribution ?? 0
}

/** 缴存结束后的第一个月（不考虑退休）。 */
export function fundContributionEndMonth(global: GlobalParams, fund: FundAccount): number {
  const lastYear = fund.contributionSegments
    ? Math.max(...fund.contributionSegments.map((s) => s.endYear), global.startYear - 1)
    : global.startYear + Math.max(0, (fund.contributionYears ?? 0) - 1)
  // 日历上的下一年 1 月，相对模拟起点的月序。
  return Math.max(0, (lastYear + 1 - global.startYear) * 12 - (global.startMonth - 1))
}

/** 公积金缴存与到期处理时点，供模拟与里程碑共享。 */
export function fundTimeline(global: GlobalParams, fund: FundAccount | null) {
  if (!fund) return { contribUntilM: 0, processAtM: 0 }
  const contribEndM = fundContributionEndMonth(global, fund)
  const retireM = global.retireYear
    ? Math.max(0, (global.retireYear - global.startYear) * 12 - (global.startMonth - 1))
    : null
  return {
    contribUntilM: Math.min(contribEndM, retireM ?? contribEndM),
    processAtM: retireM ?? contribEndM,
  }
}

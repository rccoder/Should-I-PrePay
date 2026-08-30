import { describe, expect, it } from 'vitest'
import { defaultScenarios } from '../presets'
import { FUND_BALANCE_AMOUNT } from '../types'

describe('默认还款方案', () => {
  it('第三方案在公积金年冲基础上额外还房贷，并在真实 12 月发生', () => {
    const scenarios = defaultScenarios({ global: { startMonth: 7 } })
    expect(scenarios.map((s) => s.name)).toEqual([
      '只做月冲',
      '月冲 + 公积金年冲',
      '月冲 + 年冲 + 额外还款',
    ])
    expect(scenarios[1]!.events).toHaveLength(1)
    expect(scenarios[2]!.events).toHaveLength(2)
    const fundEvent = scenarios[2]!.events.find((event) => event.source === 'fund')!
    const extraEvent = scenarios[2]!.events.find((event) => event.source === 'cash')!
    expect(fundEvent.amount).toBe(FUND_BALANCE_AMOUNT)
    expect(fundEvent.monthIndex).toBe(5) // 7 月起模拟，当年 12 月
    expect(extraEvent.targetGroup).toBe('housing')
  })
})

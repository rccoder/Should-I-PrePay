import { describe, expect, it } from 'vitest'
import { expandEvents, EVENT_PRIORITY, lastBoundedOccurrence } from '../events'
import type {
  BigExpenseEvent,
  BigIncomeEvent,
  PrepayEvent,
  PeriodicInvestEvent,
} from '../types'

const HORIZON = 120 // 10 年

describe('expandEvents 事件展开', () => {
  it('单次事件只出现一次', () => {
    const ev: PrepayEvent = {
      id: 'a', type: 'prepay', monthIndex: 13, amount: 100_000,
      effect: 'shorten-term', source: 'cash',
    }
    const map = expandEvents([ev], HORIZON)
    expect(map.get(13)).toEqual([ev])
    expect(map.size).toBe(1)
  })

  it('每年重复：吸附到 monthOfYear，直到终点', () => {
    const ev: BigExpenseEvent = {
      id: 'b', type: 'big-expense', monthIndex: 14, label: '教育',
      amount: 30_000, source: 'cash',
      repeat: { everyYears: 1, monthOfYear: 6 },
    }
    const map = expandEvents([ev], HORIZON)
    // 首发年在第 2 年（monthIndex=14 → year 1），此后每年 6 月（月序 year*12+5）
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([17, 29, 41, 53, 65, 77, 89, 101, 113])
  })

  it('每两年重复 + count 上限', () => {
    const ev: BigExpenseEvent = {
      id: 'c', type: 'big-expense', monthIndex: 0, label: '换车',
      amount: 200_000, source: 'cash',
      repeat: { everyYears: 2, monthOfYear: 12, count: 3 },
    }
    const map = expandEvents([ev], HORIZON)
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([11, 35, 59])
  })

  it('年度事件在非 1 月起始时仍锚定真实日历月', () => {
    const ev: PrepayEvent = {
      id: 'calendar', type: 'prepay', monthIndex: 5, amount: 1,
      effect: 'shorten-term', source: 'cash',
      repeat: { everyYears: 1, monthOfYear: 12, count: 2 },
    }
    // 7 月起模拟：当年 12 月是 m=5，次年 12 月是 m=17。
    expect([...expandEvents([ev], 24, 7).keys()]).toEqual([5, 17])
  })

  it('everyMonths 按线性月份重复，untilMonth 截断', () => {
    const ev: PrepayEvent = {
      id: 'd', type: 'prepay', monthIndex: 0, amount: 10_000,
      effect: 'reduce-payment', source: 'cash',
      repeat: { everyMonths: 6, untilMonth: 20 },
    }
    const map = expandEvents([ev], HORIZON)
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([0, 6, 12, 18])
  })

  it('定投：每年 monthOfYear 月一次直到终点', () => {
    const ev: PeriodicInvestEvent = {
      id: 'e', type: 'invest', monthIndex: 3, monthOfYear: 1,
      amount: 50_000, poolId: 'pool-hi',
    }
    const map = expandEvents([ev], HORIZON)
    expect([...map.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, y) => y * 12),
    )
  })

  it('同月多条按执行优先级排序，同级按 id 稳定排序', () => {
    const invest: PeriodicInvestEvent = { id: 'i1', type: 'invest', monthIndex: 5, monthOfYear: 6, amount: 1, poolId: 'p' }
    const expense: BigExpenseEvent = { id: 'x1', type: 'big-expense', monthIndex: 5, label: '', amount: 1, source: 'cash' }
    const prepayB: PrepayEvent = { id: 'p2', type: 'prepay', monthIndex: 5, amount: 1, effect: 'shorten-term', source: 'cash' }
    const income: BigIncomeEvent = { id: 'g1', type: 'big-income', monthIndex: 5, label: '', amount: 1, target: 'cash' }
    const prepayA: PrepayEvent = { id: 'p1', type: 'prepay', monthIndex: 5, amount: 1, effect: 'shorten-term', source: 'cash' }
    const map = expandEvents([invest, expense, prepayB, income, prepayA], HORIZON)
    expect(map.get(5)?.map((e) => e.id)).toEqual(['g1', 'x1', 'p1', 'p2', 'i1'])
  })

  it('优先级常量与流水线顺序一致：收入 < 支出 < 还款 < 定投', () => {
    expect(EVENT_PRIORITY['big-income']).toBeLessThan(EVENT_PRIORITY['big-expense'])
    expect(EVENT_PRIORITY['big-expense']).toBeLessThan(EVENT_PRIORITY.prepay)
    expect(EVENT_PRIORITY.prepay).toBeLessThan(EVENT_PRIORITY.invest)
  })
})

describe('lastBoundedOccurrence 有界重复的末次发生月', () => {
  it('everyYears + count：末次 = 第 count−1 次吸附位置', () => {
    const ev: PrepayEvent = {
      id: 'a', type: 'prepay', monthIndex: 0, amount: 1,
      effect: 'shorten-term', source: 'cash',
      repeat: { everyYears: 1, count: 10 },
    }
    // i=0 在月 0；i≥1 落在 (anchorYear+i)·12+0 → 第 10 次在月 108
    expect(lastBoundedOccurrence(ev)).toBe(108)
  })

  it('带 monthOfYear 吸附时按吸附结果计', () => {
    const ev: BigExpenseEvent = {
      id: 'b', type: 'big-expense', monthIndex: 14, label: '教育',
      amount: 1, source: 'cash',
      repeat: { everyYears: 1, monthOfYear: 6, count: 3 },
    }
    // 发生月 17、29、41（与 expandEvents 用例同源）
    expect(lastBoundedOccurrence(ev)).toBe(41)
  })

  it('仅 untilMonth：取不超过它的最后一次', () => {
    const ev: PrepayEvent = {
      id: 'c', type: 'prepay', monthIndex: 0, amount: 1,
      effect: 'reduce-payment', source: 'cash',
      repeat: { everyMonths: 6, untilMonth: 20 },
    }
    expect(lastBoundedOccurrence(ev)).toBe(18)
  })

  it('无界重复、无重复事件与定投返回 null（不延伸终点）', () => {
    const unbounded: BigExpenseEvent = {
      id: 'd', type: 'big-expense', monthIndex: 3, label: '',
      amount: 1, source: 'cash', repeat: { everyYears: 1 },
    }
    const single: PrepayEvent = {
      id: 'e', type: 'prepay', monthIndex: 5, amount: 1,
      effect: 'shorten-term', source: 'cash',
    }
    const invest: PeriodicInvestEvent = {
      id: 'f', type: 'invest', monthIndex: 2, monthOfYear: 12, amount: 1, poolId: 'p',
    }
    expect(lastBoundedOccurrence(unbounded)).toBeNull()
    expect(lastBoundedOccurrence(single)).toBeNull()
    expect(lastBoundedOccurrence(invest)).toBeNull()
  })
})

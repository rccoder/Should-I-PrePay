import { makeId } from './ids'
import type { PrepayEffect } from './loan'
import type { GlobalParams, PrepayEvent, ScenarioDef } from './types'
import { FUND_BALANCE_AMOUNT } from './types'

/**
 * 预设快捷方案模板（一键套用后用户可再微调）。
 * M4 阶段会补充更多模板与 UI 入口。
 */

/** 基准方案事件集：完全不提前还款 */
export function presetNoPrepay(): PrepayEvent[] {
  return []
}

/** 公积金年冲：每年年底用全部公积金余额提前还款 */
/** 模拟起点所在自然年的 12 月相对月序。 */
export function yearEndMonthIndex(startMonth = 1): number {
  return 12 - startMonth
}

export function presetFundYearlyPrepay(startMonth = 1): PrepayEvent[] {
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: yearEndMonthIndex(startMonth),
    amount: FUND_BALANCE_AMOUNT,
    effect: 'shorten-term',
    source: 'fund',
    repeat: { everyYears: 1, monthOfYear: 12 },
  }
  return [ev]
}

/** 现金年冲：每年年底用固定现金金额提前还款，不够的现金补 */
export function presetCashYearlyPrepay(
  amount: number,
  effect: PrepayEffect = 'shorten-term',
  startMonth = 1,
): PrepayEvent[] {
  if (amount <= 0) return []
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: yearEndMonthIndex(startMonth),
    amount,
    effect,
    targetGroup: 'housing',
    source: 'cash',
    repeat: { everyYears: 1, monthOfYear: 12 },
  }
  return [ev]
}

/** 从当前输入生成默认方案：[月冲] + [月冲+年冲] + [月冲+年冲+额外还款]。 */
export function defaultScenarios(input: { global: Pick<GlobalParams, 'startMonth'> }): ScenarioDef[] {
  return [
    {
      id: makeId(),
      name: '只做月冲',
      colorSlot: 1,
      isBaseline: true,
      events: presetNoPrepay(),
    },
    {
      id: makeId(),
      name: '月冲 + 公积金年冲',
      colorSlot: 2,
      isBaseline: false,
      events: presetFundYearlyPrepay(input.global.startMonth),
    },
    {
      id: makeId(),
      name: '月冲 + 年冲 + 额外还款',
      colorSlot: 3,
      isBaseline: false,
      events: [
        ...presetFundYearlyPrepay(input.global.startMonth),
        ...presetCashYearlyPrepay(100_000, 'shorten-term', input.global.startMonth),
      ],
    },
  ]
}

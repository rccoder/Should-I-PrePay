import { makeId } from './ids'
import type { PrepayEffect } from './loan'
import type {
  AnalysisInput,
  FundAccount,
  PrepayEvent,
  ScenarioDef,
} from './types'
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
export function presetFundYearlyPrepay(): PrepayEvent[] {
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: 11, // 12月（0-based）
    amount: FUND_BALANCE_AMOUNT,
    effect: 'shorten-term',
    source: 'fund',
    repeat: { everyYears: 1 },
  }
  return [ev]
}

/** 现金年冲：每年年底用固定现金金额提前还款，不够的现金补 */
export function presetCashYearlyPrepay(
  amount: number,
  effect: PrepayEffect = 'shorten-term',
): PrepayEvent[] {
  if (amount <= 0) return []
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: 11, // 12月（0-based）
    amount,
    effect,
    source: 'cash',
    repeat: { everyYears: 1 },
  }
  return [ev]
}

/** 从当前输入生成默认方案列表：[基准] + 公积金年冲 + 现金年冲 */
export function defaultScenarios(input: Pick<AnalysisInput, 'fund'>): ScenarioDef[] {
  return [
    {
      id: makeId(),
      name: '不提前还款',
      colorSlot: 1,
      isBaseline: true,
      events: presetNoPrepay(),
    },
    {
      id: makeId(),
      name: '公积金年冲',
      colorSlot: 2,
      isBaseline: false,
      events: presetFundYearlyPrepay(),
    },
    {
      id: makeId(),
      name: '现金年冲',
      colorSlot: 3,
      isBaseline: false,
      events: presetCashYearlyPrepay(100_000), // 默认每年10万
    },
  ]
}

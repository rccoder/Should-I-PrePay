import { makeId } from './ids'
import type { PrepayEffect } from './loan'
import type {
  AnalysisInput,
  FundAccount,
  PrepayEvent,
  ScenarioDef,
} from './types'

/**
 * 预设快捷方案模板（一键套用后用户可再微调）。
 * M4 阶段会补充更多模板与 UI 入口。
 */

/** 基准方案事件集：完全不提前还款 */
export function presetNoPrepay(): PrepayEvent[] {
  return []
}

/** 公积金余额一次性冲抵：立即用全部公积金余额提前还款（锁定资金机会成本≈0，见需求文档「公积金深度建模」） */
export function presetFundLumpSum(
  fund: FundAccount | null,
  effect: PrepayEffect = 'shorten-term',
): PrepayEvent[] {
  if (!fund || fund.initialBalance <= 0) return []
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: 0,
    amount: Math.floor(fund.initialBalance),
    effect,
    source: 'fund',
  }
  return [ev]
}

/** 每年年底把攒下的钱还进去（对应真实「年冲」习惯） */
export function presetYearEndSweep(amount: number): PrepayEvent[] {
  if (amount <= 0) return []
  const ev: PrepayEvent = {
    id: makeId(),
    type: 'prepay',
    monthIndex: 11,
    amount,
    effect: 'shorten-term',
    source: 'cash',
    repeat: { everyYears: 1 },
  }
  return [ev]
}

/** 从当前输入生成默认方案列表：[基准] + 公积金冲抵示例 */
export function defaultScenarios(input: Pick<AnalysisInput, 'fund'>): ScenarioDef[] {
  const list: ScenarioDef[] = [
    {
      id: makeId(),
      name: '不提前还款',
      colorSlot: 1,
      isBaseline: true,
      events: presetNoPrepay(),
    },
  ]
  const fundLump = presetFundLumpSum(input.fund)
  if (fundLump.length > 0) {
    list.push({
      id: makeId(),
      name: '公积金一次性冲抵',
      colorSlot: 2 as const,
      isBaseline: false,
      events: fundLump,
    })
  }
  return list
}

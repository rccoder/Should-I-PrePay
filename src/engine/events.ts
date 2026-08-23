import type { SimEvent } from './types'

/**
 * 事件展开：把「单次 + 重复规则」的 SimEvent 物化为具体月份实例。
 * 循环前一次性预计算，模拟循环内零分支。
 */

/** 同月多条事件的执行优先级（与 simulate 流水线一致）：先收入、再支出、再还款、最后定投 */
export const EVENT_PRIORITY: Record<SimEvent['type'], number> = {
  'big-income': 0,
  'big-expense': 1,
  prepay: 2,
  invest: 3,
}

/**
 * 事件在其重复序列中的第 i 次发生月（相对模拟起点，0-based）；序列结束返回 null。
 *
 * 语义约定：
 * - 无 repeat：仅第 0 次发生在 monthIndex，之后立即结束
 * - everyMonths：从 monthIndex 起线性间隔重复
 * - 年重复且显式给出 monthOfYear：所有发生（含首次）都吸附到「anchor 年 + i·步长」年的该月
 * - 年重复未给 monthOfYear：首发在原位，后续保持相同年内位置
 */
function occurrenceMonth(ev: SimEvent, i: number): number | null {
  if (ev.type === 'invest') {
    // 定投：从 monthIndex 所在年起，每年 monthOfYear 月一次
    const anchorYear = Math.floor(ev.monthIndex / 12)
    return (anchorYear + i) * 12 + (ev.monthOfYear - 1)
  }
  const repeat = 'repeat' in ev ? ev.repeat : undefined
  if (!repeat) return i === 0 ? ev.monthIndex : null

  const everyMonths = repeat.everyMonths
  if (everyMonths && everyMonths > 0) {
    return ev.monthIndex + i * everyMonths
  }
  const stepYears =
    repeat.everyYears && repeat.everyYears > 0 ? repeat.everyYears : 1
  const anchorYear = Math.floor(ev.monthIndex / 12)
  if (repeat.monthOfYear) {
    return (anchorYear + i * stepYears) * 12 + (repeat.monthOfYear - 1)
  }
  return i === 0
    ? ev.monthIndex
    : (anchorYear + i * stepYears) * 12 + (ev.monthIndex % 12)
}

function occurrenceCap(ev: SimEvent, horizon: number): (i: number, month: number) => boolean {
  const repeat = 'repeat' in ev ? ev.repeat : undefined
  return (i, month) => {
    if (month >= horizon) return false
    if (repeat?.count !== undefined && i >= repeat.count) return false
    if (repeat?.untilMonth !== undefined && month > repeat.untilMonth) return false
    return true
  }
}

/**
 * 展开全部事件 → Map<月序, 事件[]>，同月按执行优先级 + id 稳定排序（坑 7：确定性）。
 * invest 无 repeat 概念，天然每年一次直到终点。
 */
export function expandEvents(events: SimEvent[], horizon: number): Map<number, SimEvent[]> {
  const byMonth = new Map<number, SimEvent[]>()
  for (const ev of events) {
    const cap = occurrenceCap(ev, horizon)
    for (let i = 0; ; i++) {
      const month = occurrenceMonth(ev, i)
      if (month === null || !cap(i, month)) break
      let list = byMonth.get(month)
      if (!list) {
        list = []
        byMonth.set(month, list)
      }
      list.push(ev)
    }
  }
  for (const list of byMonth.values()) {
    list.sort(
      (a, b) =>
        EVENT_PRIORITY[a.type] - EVENT_PRIORITY[b.type] || a.id.localeCompare(b.id),
    )
  }
  return byMonth
}

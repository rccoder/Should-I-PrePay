import type { EventSource, Id } from './types'

/**
 * 账户扣减/入账原语。约定：
 * - 现金允许透支为负（断裂策略，见 implementation-plan.md 坑 5），但「可动用」按 max(cash,0) 计
 * - 公积金只能用于还贷（月冲/提前还款），不可用于大额支出；余额 clamp ≥ 0（坑 3）
 * - 扣不足时执行 min(amount, available) 并由调用方产出 warning
 */

export interface AccountViews {
  cash: number
  pools: Map<Id, number>
  fundBalance: number | null // null = 无公积金账户
}

export function makeAccountViews(input: {
  initialCash: number
  poolBalances: Record<Id, number>
  fundBalance: number | null
}): AccountViews {
  return {
    cash: input.initialCash,
    pools: new Map(Object.entries(input.poolBalances)),
    fundBalance: input.fundBalance,
  }
}

/** 来源账户当前可动用金额 */
export function availableIn(source: EventSource, accts: AccountViews, poolId?: Id): number {
  switch (source) {
    case 'cash':
      return Math.max(accts.cash, 0)
    case 'wealth': {
      if (!poolId) return 0
      return accts.pools.get(poolId) ?? 0
    }
    case 'fund':
      return Math.max(accts.fundBalance ?? 0, 0)
  }
}

/**
 * 从来源扣款，返回实际执行额（≤ amount）。现金来源不 clamp 到非负——
 * 可动用按 max(cash,0)，但扣减后允许为负。
 */
export function debit(
  source: EventSource,
  amount: number,
  accts: AccountViews,
  poolId?: Id,
): number {
  const available = availableIn(source, accts, poolId)
  const executed = Math.min(amount, available)
  applyDelta(source, -executed, accts, poolId)
  return executed
}

/** 入账到目标账户 */
export function credit(
  target: EventSource,
  amount: number,
  accts: AccountViews,
  poolId?: Id,
): void {
  applyDelta(target, amount, accts, poolId)
}

function applyDelta(
  source: EventSource,
  delta: number,
  accts: AccountViews,
  poolId?: Id,
): void {
  switch (source) {
    case 'cash':
      accts.cash += delta
      break
    case 'wealth': {
      if (!poolId) break
      const cur = accts.pools.get(poolId) ?? 0
      const next = cur + delta
      accts.pools.set(poolId, Math.max(0, next))
      break
    }
    case 'fund': {
      if (accts.fundBalance === null) break
      accts.fundBalance = Math.max(0, accts.fundBalance + delta)
      break
    }
  }
}

import type { Id, LoanInput, RepaymentMethod } from './types'
import { monthlyRate } from './rate'

/**
 * 贷款数学核心：摊还公式 + 四种提前还款重算。
 * 正确性由 __tests__/loan.test.ts 以「手工案例精确到分 + 性质测试」双重锁定。
 */

/** 浮点尾差吸收阈值（见 implementation-plan.md 坑 1） */
export const EPSILON_BALANCE = 0.005

export type PrepayEffect = 'shorten-term' | 'reduce-payment'

/** 贷款运行时状态。paymentAnchor：等额本息=月供 M；等额本金=每月应还本金 p */
export interface LoanState {
  id: Id
  method: RepaymentMethod
  balance: number
  paymentAnchor: number
  monthsLeft: number
}

/** 等额本息月供：M = B·i·(1+i)^n / ((1+i)^n − 1)；i=0 时 M = B/n */
export function annuityPayment(balance: number, monthlyRateI: number, months: number): number {
  if (months <= 0) return 0
  if (monthlyRateI === 0) return balance / months
  const f = Math.pow(1 + monthlyRateI, months)
  return (balance * monthlyRateI * f) / (f - 1)
}

/** 等额本息缩短期限求解：已知月供 M 反解剩余期数实数解 */
export function solveAnnuityMonths(
  balance: number,
  monthlyRateI: number,
  payment: number,
): number {
  if (payment <= 0) return Infinity
  if (monthlyRateI === 0) return balance / payment
  // 由 M = B·i/(1−(1+i)^−n) 推出 n = −ln(1 − B·i/M) / ln(1+i)
  const x = 1 - (balance * monthlyRateI) / payment
  if (x <= 0) return Infinity
  return -Math.log(x) / Math.log(1 + monthlyRateI)
}

export function initLoanState(loan: LoanInput): LoanState {
  const i = monthlyRate(loan.currentRate)
  if (loan.method === 'linear') {
    return {
      id: loan.id,
      method: loan.method,
      balance: loan.principal,
      paymentAnchor: loan.principal / loan.remainingMonths,
      monthsLeft: loan.remainingMonths,
    }
  }
  return {
    id: loan.id,
    method: loan.method,
    balance: loan.principal,
    paymentAnchor: annuityPayment(loan.principal, i, loan.remainingMonths),
    monthsLeft: loan.remainingMonths,
  }
}

export interface ScheduledMonth {
  interest: number
  principalPart: number
  payment: number
}

/** 预览当月计划供款（不修改状态）。末期实付 = 余下本金 + 当期利息；余额绝不穿负 */
export function peekScheduled(s: LoanState, annualRate: number): ScheduledMonth {
  const i = monthlyRate(annualRate)
  const interest = s.balance * i
  let principalPart: number
  if (s.method === 'linear') {
    principalPart = Math.min(s.paymentAnchor, s.balance)
  } else {
    principalPart =
      s.monthsLeft <= 1 ? s.balance : Math.min(s.paymentAnchor - interest, s.balance)
  }
  if (Math.abs(principalPart) < EPSILON_BALANCE && s.balance !== 0) {
    principalPart = s.balance
  }
  return { interest, principalPart, payment: interest + principalPart }
}

/** 落账：把 peekScheduled 的结果应用到贷款状态 */
export function applyPeeked(s: LoanState, r: ScheduledMonth): void {
  s.balance -= r.principalPart
  if (Math.abs(s.balance) < EPSILON_BALANCE) s.balance = 0
  s.monthsLeft = s.balance === 0 ? 0 : Math.max(0, s.monthsLeft - 1)
}

/**
 * 按计划推进一个月（提前还款/利率变动之外的正常月供）。
 * |balance| < 阈值即结清置零。
 */
export function advanceScheduled(s: LoanState, annualRate: number): ScheduledMonth {
  const r = peekScheduled(s, annualRate)
  applyPeeked(s, r)
  return r
}

/** 利率重定价日（m%12===0）对在还贷款重算 anchor：等额本息按「期限不变」重算月供；等额本金天然自适应 */
export function reanchorOnRateChange(s: LoanState, newAnnualRate: number): void {
  if (s.method !== 'annuity' || s.balance === 0) return
  const i = monthlyRate(newAnnualRate)
  s.paymentAnchor = annuityPayment(s.balance, i, s.monthsLeft)
}

export interface PrepayRecalc {
  /** false = 触发护栏回退为「减少月供」行为 */
  appliedAsRequested: boolean
  newAnchor: number
  newMonthsLeft: number
}

/**
 * 提前还款后的四种重算（balanceAfter 为扣掉还款额后的余额，须 > 0）。
 *
 * - 本息+缩期限：解实数期数 → round 取整 → 用整数期反算新月供；
 *   护栏：B'·i ≥ M（月供不够付息）时回退「减少月供」并标记（坑 2）
 * - 本息+减月供：期限不变，M' = annuityPayment(B', i, n')
 * - 本金+缩期限：p 不变，n' = ceil(B'/p)
 * - 本金+减月供：终点不变，p' = B'/n'
 */
export function recalcAfterPrepay(
  method: RepaymentMethod,
  effect: PrepayEffect,
  balanceAfter: number,
  monthlyRateI: number,
  prevAnchor: number,
  prevMonthsLeft: number,
): PrepayRecalc {
  if (method === 'linear') {
    if (effect === 'shorten-term') {
      const nInt = Math.max(1, Math.ceil(balanceAfter / prevAnchor))
      return { appliedAsRequested: true, newAnchor: prevAnchor, newMonthsLeft: nInt }
    }
    return {
      appliedAsRequested: true,
      newAnchor: balanceAfter / prevMonthsLeft,
      newMonthsLeft: prevMonthsLeft,
    }
  }

  // 等额本息
  if (effect === 'shorten-term') {
    const interestWouldExceed =
      monthlyRateI > 0 && balanceAfter * monthlyRateI >= prevAnchor
    if (interestWouldExceed) {
      // 护栏回退：按减月供处理
      const anchor = annuityPayment(balanceAfter, monthlyRateI, prevMonthsLeft)
      return { appliedAsRequested: false, newAnchor: anchor, newMonthsLeft: prevMonthsLeft }
    }
    const nReal = solveAnnuityMonths(balanceAfter, monthlyRateI, prevAnchor)
    const nInt = Math.max(1, Math.round(nReal))
    const anchor = annuityPayment(balanceAfter, monthlyRateI, nInt)
    return { appliedAsRequested: true, newAnchor: anchor, newMonthsLeft: nInt }
  }
  const anchor = annuityPayment(balanceAfter, monthlyRateI, prevMonthsLeft)
  return { appliedAsRequested: true, newAnchor: anchor, newMonthsLeft: prevMonthsLeft }
}

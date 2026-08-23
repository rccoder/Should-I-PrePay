import { describe, expect, it } from 'vitest'
import {
  advanceScheduled,
  annuityPayment,
  initLoanState,
  recalcAfterPrepay,
  reanchorOnRateChange,
  solveAnnuityMonths,
} from '../loan'
import type { LoanInput } from '../types'

/** 手工可验标准案例：12 万 / 12 期 / 年利率 12%（月利率 1%） */
const P = 120_000
const I = 0.01
const N = 12

describe('annuityPayment 等额本息月供', () => {
  it('12万/12期/12% 月供应为 10661.85 元', () => {
    // M = 120000 × 0.01 × 1.01^12 / (1.01^12 − 1) ≈ 10661.8547
    expect(annuityPayment(P, I, N)).toBeCloseTo(10661.85, 1)
  })

  it('零利率退化为本金均摊', () => {
    expect(annuityPayment(12000, 0, 12)).toBeCloseTo(1000, 10)
  })

  it('期数为 0 时月供为 0', () => {
    expect(annuityPayment(12000, 0.01, 0)).toBe(0)
  })
})

describe('solveAnnuityMonths 反解期数', () => {
  it('与 annuityPayment 构成往返一致', () => {
    for (const n of [6, 24, 60, 360]) {
      const m = annuityPayment(P, I, n)
      expect(solveAnnuityMonths(P, I, m)).toBeCloseTo(n, 4)
    }
  })

  it('零利率时 B/M', () => {
    expect(solveAnnuityMonths(6000, 0, 500)).toBeCloseTo(12, 8)
  })

  it('月供不够付息时返回 Infinity', () => {
    expect(solveAnnuityMonths(100000, 0.05, 4500)).toBe(Infinity)
  })
})

function makeAnnuityLoan(overrides: Partial<LoanInput> = {}): LoanInput {
  return {
    id: 'loan-1',
    name: '商业贷款',
    kind: 'commercial',
    principal: P,
    remainingMonths: N,
    currentRate: 0.12,
    method: 'annuity',
    rateRules: [],
    ...overrides,
  }
}

describe('advanceScheduled 全周期摊还性质', () => {
  it('等额本息：Σ本金=初始、末期恰好归零、Σ实付≈n×M', () => {
    const s = initLoanState(makeAnnuityLoan())
    const anchorAtStart = s.paymentAnchor
    let totalInterest = 0
    let totalPaid = 0
    let months = 0
    while (s.balance > 0 && months < 100) {
      const { interest, payment } = advanceScheduled(s, 0.12)
      totalInterest += interest
      totalPaid += payment
      months++
    }
    expect(months).toBe(N)
    expect(s.balance).toBe(0)
    expect(anchorAtStart).toBeCloseTo(10661.85, 1)
    // 尾差吸收后 Σ实付与理论总额差应在分级
    expect(totalPaid - totalInterest).toBeCloseTo(P, 2)
    const theoreticalTotal = annuityPayment(P, I, N) * N
    expect(totalPaid).toBeLessThanOrEqual(theoreticalTotal + 0.5)
    expect(totalPaid).toBeGreaterThanOrEqual(theoreticalTotal - 0.5)
  })

  it('等额本金：每月本金恒定、月供逐月递减', () => {
    const s = initLoanState(makeAnnuityLoan({ method: 'linear' }))
    expect(s.paymentAnchor).toBeCloseTo(P / N, 8)
    let prevPayment = Infinity
    let principalSum = 0
    let prevBalance = s.balance
    while (s.balance > 0) {
      const { principalPart, payment } = advanceScheduled(s, 0.12)
      expect(principalPart).toBeCloseTo(P / N, 6)
      expect(payment).toBeLessThan(prevPayment)
      expect(s.balance).toBeLessThan(prevBalance)
      prevPayment = payment
      prevBalance = s.balance
      principalSum += principalPart
    }
    expect(principalSum).toBeCloseTo(P, 6)
  })

  it('微小余额尾差吸收：|balance| < 0.005 视为结清', () => {
    const s = initLoanState(makeAnnuityLoan())
    s.balance = 0.003
    const r = advanceScheduled(s, 0.12)
    expect(s.balance).toBe(0)
    expect(r.principalPart).toBeCloseTo(0.003, 8)
  })
})

describe('recalcAfterPrepay 四种组合重算', () => {
  const B_AFTER = 60_000

  it('等额本金+缩短期限：p 不变，n′=ceil(B′/p)', () => {
    const r = recalcAfterPrepay('linear', 'shorten-term', B_AFTER, I, /* p */ 10_000, 12)
    expect(r.appliedAsRequested).toBe(true)
    expect(r.newAnchor).toBeCloseTo(10_000, 8)
    expect(r.newMonthsLeft).toBe(6)
  })

  it('等额本金+减少月供：终点不变，p′=B′/n′', () => {
    const r = recalcAfterPrepay('linear', 'reduce-payment', B_AFTER, I, 10_000, 12)
    expect(r.appliedAsRequested).toBe(true)
    expect(r.newAnchor).toBeCloseTo(5_000, 8)
    expect(r.newMonthsLeft).toBe(12)
  })

  it('等额本息+缩短期限：整数期反算新月供，期数缩短且公式自洽', () => {
    // 原 10 万/24 期的月供；提前还款后余额降至 8 万 → 支撑同样的月供所需期数应缩短
    const prevM = annuityPayment(100_000, I, 24)
    const r = recalcAfterPrepay('annuity', 'shorten-term', 80_000, I, prevM, 24)
    expect(r.appliedAsRequested).toBe(true)
    expect(r.newMonthsLeft).toBeLessThan(24)
    // 用新 anchor 反解出的实数期数取整后即 newMonthsLeft（自洽）
    const solved = solveAnnuityMonths(80_000, I, r.newAnchor)
    expect(Math.round(solved)).toBe(r.newMonthsLeft)
  })

  it('等额本息+减少月供：期限不变，M′=annuityPayment(B′, i, n′)', () => {
    const expected = annuityPayment(B_AFTER, I, 18)
    const r = recalcAfterPrepay('annuity', 'reduce-payment', B_AFTER, I, 9999, 18)
    expect(r.appliedAsRequested).toBe(true)
    expect(r.newAnchor).toBeCloseTo(expected, 8)
    expect(r.newMonthsLeft).toBe(18)
  })

  it('护栏：B′·i ≥ M 时回退「减少月供」并标记 appliedAsRequested=false', () => {
    // 月利率 5%，余额 10 万 → 单月利息 5000 > 原月供 4500，缩期限无解
    const r = recalcAfterPrepay('annuity', 'shorten-term', 100_000, 0.05, 4500, 36)
    expect(r.appliedAsRequested).toBe(false)
    expect(r.newAnchor).toBeCloseTo(annuityPayment(100_000, 0.05, 36), 8)
    expect(r.newMonthsLeft).toBe(36)
  })
})

describe('reanchorOnRateChange 利率重定价', () => {
  it('等额本息按期限不变重算月供，剩余期数不变，仍能还清', () => {
    const s = initLoanState(makeAnnuityLoan())
    // 还了 3 个月
    for (let k = 0; k < 3; k++) advanceScheduled(s, 0.12)
    const before = { balance: s.balance, monthsLeft: s.monthsLeft }
    reanchorOnRateChange(s, 0.06) // 利率降至 6%
    expect(s.monthsLeft).toBe(before.monthsLeft)
    expect(s.paymentAnchor).toBeCloseTo(
      annuityPayment(before.balance, 0.005, before.monthsLeft),
      8,
    )
    while (s.balance > 0) advanceScheduled(s, 0.06)
    expect(s.balance).toBe(0)
  })

  it('等额本金无需重算（月供公式天然含当期利息）', () => {
    const s = initLoanState(makeAnnuityLoan({ method: 'linear' }))
    const anchorBefore = s.paymentAnchor
    reanchorOnRateChange(s, 0.06)
    expect(s.paymentAnchor).toBe(anchorBefore)
  })
})

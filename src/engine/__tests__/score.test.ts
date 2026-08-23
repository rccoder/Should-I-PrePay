import { describe, expect, it } from 'vitest'
import { bandOf, computePeaceScore, coverageMonths, mapScore } from '../score'
import type { MonthSnap } from '../types'

function snap(m: number, cash: number, pool: number, outgo: number, broke = false): MonthSnap {
  return {
    m,
    loans: [],
    cash,
    pools: { p: pool },
    fundBalance: 0,
    cumInterest: 0,
    cumPrincipal: 0,
    cumTotalPaid: 0,
    netWorth: cash + pool,
    brokeThisMonth: broke,
    monthlyOutgo: outgo,
  }
}

describe('coverageMonths 覆盖月数', () => {
  it('流动资产/月流出', () => {
    expect(coverageMonths(48_000, 1_000)).toBeCloseTo(48, 8)
  })
  it('零开销视为充裕（封顶 600）', () => {
    expect(coverageMonths(1_000, 0)).toBe(600)
  })
})

describe('mapScore 分段映射边界值', () => {
  it.each([
    [0, 0],
    [3, 12.5],
    [6, 25],
    [9, 37.5],
    [12, 50],
    [24, 65],
    [36, 80],
    [48, 90],
    [60, 100],
    [120, 100], // 封顶
  ])('coverage=%i → score=%i', (c, expected) => {
    expect(mapScore(c)).toBeCloseTo(expected, 6)
  })
})

describe('bandOf 带位', () => {
  it('五档带位', () => {
    expect(bandOf(85)).toBe('stable')
    expect(bandOf(70)).toBe('comfortable')
    expect(bandOf(45)).toBe('tense')
    expect(bandOf(30)).toBe('anxious')
    expect(bandOf(10)).toBe('danger')
  })
})

describe('computePeaceScore 综合分', () => {
  it('全程高覆盖无断裂 → 高分安稳', () => {
    const snaps = Array.from({ length: 24 }, (_, i) => snap(i, 48_000, 0, 1_000))
    const score = computePeaceScore(snaps, snaps)
    // s1=s2=s3=mapScore(48)=90，s4=100 → round(90×0.85 + 15) = 92
    expect(score.score).toBe(92)
    expect(score.band).toBe('stable')
    expect(score.worstCoverage).toBeCloseTo(48, 6)
  })

  it('预期情形断裂触发硬帽 ≤25', () => {
    const good = Array.from({ length: 24 }, (_, i) => snap(i, 480_000, 0, 1_000))
    const withBreak = good.map((s) => (s.m === 10 ? { ...s, brokeThisMonth: true } : s))
    const stressClean = good
    const score = computePeaceScore(withBreak, stressClean)
    expect(score.brokeFromBase).toBe(10)
    expect(score.score).toBeLessThanOrEqual(25)
    expect(score.band).toBe('danger')
  })

  it('仅压力情形断裂硬帽 ≤40', () => {
    const base = Array.from({ length: 24 }, (_, i) => snap(i, 240_000, 0, 1_000)) // coverage 240 → 满分
    const stressBreak = base.map((s) => (s.m === 5 ? { ...s, brokeThisMonth: true } : s))
    const score = computePeaceScore(base, stressBreak)
    expect(score.brokeFromBase).toBeNull()
    expect(score.brokeMonthsStress).toBe(1)
    expect(score.score).toBeLessThanOrEqual(40)
  })

  it('最危险时刻取全期最低覆盖点', () => {
    const dips = [
      snap(0, 36_000, 0, 1_000),
      snap(1, 3_000, 0, 1_000), // 最危险：3 个月覆盖
      snap(2, 36_000, 0, 1_000),
    ]
    const score = computePeaceScore(dips, dips)
    expect(score.worstCoverage).toBeCloseTo(3, 6)
    expect(score.worstMonth).toBe(1)
  })
})

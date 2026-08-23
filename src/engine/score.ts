import type { MonthSnap, PeaceScore } from './types'

/**
 * 存款宽心指数（0–100）。
 *
 * 底层指标：coverage(m) = 流动资产 / 当月必需流出（月）。
 * 流动资产 = 活钱 + 理财池（公积金用途受限不计入——口径在 UI 注明，后续可开放配置）。
 *
 * 分段映射：≥36月 安稳(80–100) ｜ 12–36 舒适(50–80) ｜ 6–12 焦虑(25–50) ｜ <6 危险(0–25)
 * 综合分 = 0.20·当前跑道 + 0.35·最危险时刻(预期) + 0.30·压力跑道 + 0.15·断裂惩罚
 * 硬帽：预期情形断裂 ≤ 24（落入「危险」红档）；仅压力情形断裂 ≤ 39（「焦虑」档）。
 */

const WEIGHT_CURRENT = 0.2
const WEIGHT_WORST = 0.35
const WEIGHT_STRESS = 0.3
const WEIGHT_BROKEN = 0.15

/** 单月覆盖月数；开销≈0 时视为充裕（封顶 600 月防 Infinity） */
export function coverageMonths(liquid: number, monthlyOutgo: number): number {
  if (monthlyOutgo <= 0) return 600
  return Math.min(600, liquid / monthlyOutgo)
}

/** 分段映射到 0–100 分 */
export function mapScore(c: number): number {
  if (c >= 36) return 80 + Math.min(20, ((c - 36) / 24) * 20)
  if (c >= 12) return 50 + ((c - 12) / 24) * 30
  if (c >= 6) return 25 + ((c - 6) / 6) * 25
  return Math.max(0, (c / 6) * 25)
}

export function bandOf(score: number): PeaceScore['band'] {
  if (score >= 80) return 'stable'
  if (score >= 60) return 'comfortable'
  if (score >= 40) return 'tense'
  if (score >= 25) return 'anxious'
  return 'danger'
}

function coverageOf(snap: MonthSnap): number {
  const liquid = snap.cash + Object.values(snap.pools).reduce((a, b) => a + b, 0)
  return coverageMonths(liquid, snap.monthlyOutgo)
}

export function computePeaceScore(baseSnaps: MonthSnap[], stressSnaps: MonthSnap[]): PeaceScore {
  const currentCoverage = baseSnaps.length > 0 ? coverageOf(baseSnaps[0]!) : 0
  let worstCoverage = currentCoverage
  let worstMonth = 0
  for (const s of baseSnaps) {
    const c = coverageOf(s)
    if (c < worstCoverage) {
      worstCoverage = c
      worstMonth = s.m
    }
  }
  let stressWorst = Infinity
  for (const s of stressSnaps) {
    stressWorst = Math.min(stressWorst, coverageOf(s))
  }
  if (!Number.isFinite(stressWorst)) stressWorst = 0

  const brokeFrom = baseSnaps.find((s) => s.brokeThisMonth)
  const brokeMonthsBase = baseSnaps.filter((s) => s.brokeThisMonth).length
  const brokeMonthsStress = stressSnaps.filter((s) => s.brokeThisMonth).length

  const s1 = mapScore(currentCoverage)
  const s2 = mapScore(worstCoverage)
  const s3 = mapScore(stressWorst)
  const s4 = brokeMonthsBase === 0 ? 100 : Math.max(0, 100 - brokeMonthsBase * 15)

  let score = Math.round(
    WEIGHT_CURRENT * s1 + WEIGHT_WORST * s2 + WEIGHT_STRESS * s3 + WEIGHT_BROKEN * s4,
  )
  if (brokeMonthsBase > 0) score = Math.min(score, 24)
  else if (brokeMonthsStress > 0) score = Math.min(score, 39)

  return {
    score,
    band: bandOf(score),
    currentCoverage,
    worstCoverage,
    worstMonth,
    stressWorstCoverage: stressWorst,
    brokeFromBase: brokeFrom ? brokeFrom.m : null,
    brokeMonthsBase,
    brokeMonthsStress,
  }
}

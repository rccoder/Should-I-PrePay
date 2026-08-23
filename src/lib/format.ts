/** 金额与百分比格式化（中文界面口径） */

/** 元 → 显示字符串：≥1 万以「万」计，保留 1 位小数；否则保留 0 位 */
export function formatMoney(yuan: number, opts: { precise?: boolean } = {}): string {
  if (!Number.isFinite(yuan)) return '—'
  const abs = Math.abs(yuan)
  const sign = yuan < 0 ? '−' : ''
  if (abs >= 10_000) {
    const wan = abs / 10_000
    const digits = opts.precise ? 2 : wan >= 100 ? 0 : 1
    return `${sign}${wan.toFixed(digits)} 万`
  }
  return `${sign}${abs.toFixed(0)} 元`
}

/** 元 → 纯数字万元（用于输入框） */
export function yuanToWan(yuan: number): number {
  return Math.round((yuan / 10_000) * 100) / 100
}

export function wanToYuan(wan: number): number {
  return Math.round(wan * 10_000)
}

/** 小数 → 百分比文案：0.039 → "3.9%" */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** 相对模拟起点的月序 → 「YYYY年M月」 */
export function monthIndexToLabel(m: number, startYear: number, startMonth: number): string {
  const abs = startMonth - 1 + m
  const year = startYear + Math.floor(abs / 12)
  const month = (abs % 12) + 1
  return `${year}年${month}月`
}

/** 覆盖月数 → 直觉文案 */
export function coverageLabel(months: number): string {
  if (months >= 600) return '非常充裕'
  if (months >= 12) return `${Math.floor(months / 12)} 年${Math.round(months % 12)} 个月`
  return `${months.toFixed(1)} 个月`
}

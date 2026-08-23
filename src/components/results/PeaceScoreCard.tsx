import type { PeaceScore } from '@/engine/types'
import { STATUS_COLORS } from '@/config/chart-theme'
import { coverageLabel } from '@/lib/format'

const BAND_META: Record<
  PeaceScore['band'],
  { label: string; color: string }
> = {
  stable: { label: '安稳', color: STATUS_COLORS.good },
  comfortable: { label: '舒适', color: STATUS_COLORS.good },
  tense: { label: '紧张', color: STATUS_COLORS.warn },
  anxious: { label: '焦虑', color: STATUS_COLORS.severe },
  danger: { label: '危险', color: STATUS_COLORS.danger },
}

/** 宽心指数卡：SVG 环形分数 + 底层指标明细 */
export function PeaceScoreCard({
  name,
  color,
  score,
}: {
  name: string
  color: string
  score: PeaceScore
}) {
  const band = BAND_META[score.band]
  const R = 42
  const C = 2 * Math.PI * R

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs">
      {/* 环形分数 */}
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--muted)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={band.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score.score / 100) * C} ${C}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold tabular-nums">{score.score}</span>
          <span className="text-[10px] text-muted-foreground">宽心指数</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-sm font-medium">{name}</span>
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${band.color}22`, color: band.color }}
          >
            {band.label}
          </span>
        </div>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            当前跑道：可覆盖 <Em>{coverageLabel(score.currentCoverage)}</Em> 开销
          </li>
          <li>
            最危险时刻：仅剩 <Em>{coverageLabel(score.worstCoverage)}</Em>
            （第 {score.worstMonth + 1} 月起）
          </li>
          <li>
            压力情形跑道：<Em>{coverageLabel(score.stressWorstCoverage)}</Em>
            {score.brokeMonthsStress > 0 && (
              <span style={{ color: STATUS_COLORS.danger }}>（压力下断裂）</span>
            )}
          </li>
          {score.brokeFromBase !== null && (
            <li style={{ color: STATUS_COLORS.danger }}>
              ⚠ 第 {score.brokeFromBase + 1} 月起资金断裂，存款无法覆盖开销与月供
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

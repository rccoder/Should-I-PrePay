import { useAppStore } from '@/store/useAppStore'
import { SCENARIO_COLORS } from '@/config/chart-theme'
import { formatMoney, monthIndexToLabel } from '@/lib/format'
import type { Milestone } from '@/engine/milestones'

/**
 * 统一时间轴（纯展示）：
 * - 「关键节点」轨道：引擎推导的里程碑（活钱见底/开始花理财/断裂/还清/退休/收入断崖）
 * - 人生事件与各方案还款段的计划位置
 * 不支持拖拽编辑——修改请在左栏对应编辑器中进行。
 */

const LIFE_META = {
  'big-expense': { label: '大额支出', color: 'var(--chart-slot-2)' },
  'big-income': { label: '大额收入', color: 'var(--chart-slot-3)' },
  invest: { label: '年度定投', color: 'var(--chart-slot-1)' },
} as const

const TONE_COLOR = {
  danger: 'var(--status-danger)',
  severe: 'var(--status-severe)',
  warn: 'var(--status-warn)',
  good: 'var(--status-good)',
  info: 'var(--chart-slot-1)',
} as const

export function TimelineEditor({
  horizon,
  milestones,
}: {
  horizon: number
  milestones: Milestone[]
}) {
  const startYear = useAppStore((s) => s.global.startYear)
  const startMonth = useAppStore((s) => s.global.startMonth)
  const lifeEvents = useAppStore((s) => s.lifeEvents)
  const scenarios = useAppStore((s) => s.scenarios)

  // 年份刻度：约 8~10 个均匀标签
  const totalYears = Math.ceil(horizon / 12)
  const stepYears = Math.max(1, Math.ceil(totalYears / 8))
  const ticks: Array<{ year: number; pct: number }> = []
  for (let y = 0; y <= totalYears; y += stepYears) {
    ticks.push({ year: y, pct: ((y * 12) / horizon) * 100 })
  }
  // 轨道背景网格线（与刻度对齐）
  const gridStyle = {
    backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px)',
    backgroundSize: `${((stepYears * 12) / horizon) * 100}% 100%`,
  }

  const prepayScenarios = scenarios.filter((x) => !x.isBaseline)

  const eventTitle = (label: string, amount: number, m: number) =>
    `${label} · ${formatMoney(amount)} · ${monthIndexToLabel(m, startYear, startMonth)}`

  return (
    <div className="select-none">
      {/* 图例 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">图例：</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-danger)' }} />
          断裂
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-severe)' }} />
          活钱见底/花理财
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-warn)' }} />
          跌破应急线/收入下降
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--status-good)' }} />
          贷款还清
        </span>
        {Object.entries(LIFE_META).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
        {prepayScenarios.map((sc) => (
          <span key={sc.id} className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SCENARIO_COLORS[sc.colorSlot] }} />
            还款·{sc.name}
          </span>
        ))}
      </div>

      {/* 年份刻度轴 */}
      <div className="relative h-5 border-b">
        {ticks.map(({ year, pct }) => (
          <div key={year} className="absolute top-0 h-full" style={{ left: `${pct}%` }}>
            <div className="h-2 w-px bg-border" />
            <span className="absolute left-0.5 top-2 whitespace-nowrap text-[10px] text-muted-foreground">
              {year === 0 ? '现在' : `${startYear + year}年`}
            </span>
          </div>
        ))}
      </div>

      {/* 关键节点轨道（引擎推导，随参数实时变化） */}
      <TrackRow label="关键节点" gridStyle={gridStyle}>
        {milestones.map((ms, i) => (
          <span
            key={`${ms.label}-${i}`}
            className="group absolute top-0 z-10 -translate-x-1/2"
            style={{ left: `${Math.min(99.5, Math.max(0.5), (ms.m / horizon) * 100)}%` }}
            title={`${ms.label} · ${monthIndexToLabel(ms.m, startYear, startMonth)}`}
          >
            <span
              className="block h-3 w-3 -translate-x-1/2 translate-y-[6px] rotate-45 border border-background shadow"
              style={{ backgroundColor: TONE_COLOR[ms.tone] }}
            />
            <span
              className="pointer-events-none absolute left-1/2 top-[22px] max-w-[9rem] -translate-x-1/2 truncate whitespace-nowrap text-[10px] leading-tight"
              style={{ color: TONE_COLOR[ms.tone] }}
            >
              {ms.label}
            </span>
          </span>
        ))}
        {milestones.length === 0 && (
          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground/60">
            当前配置下无风险节点
          </span>
        )}
      </TrackRow>

      {/* 人生事件轨道 */}
      <TrackRow label="人生事件" gridStyle={gridStyle}>
        {lifeEvents.map((ev) => (
          <StaticMarker
            key={ev.id}
            pct={(ev.monthIndex / horizon) * 100}
            color={LIFE_META[ev.type].color}
            repeatable={false}
            title={eventTitle(
              ev.type === 'invest' ? `每年定投(${ev.monthOfYear}月)` : ev.label,
              ev.amount,
              ev.monthIndex,
            )}
          />
        ))}
        {lifeEvents.length === 0 && (
          <EmptyHint text="左栏「⑤ 人生大事」里的事件会显示在这里" />
        )}
      </TrackRow>

      {/* 各方案的提前还款轨道 */}
      {prepayScenarios.map((sc) => (
        <TrackRow
          key={sc.id}
          label={`还款·${sc.name}`}
          dotColor={SCENARIO_COLORS[sc.colorSlot]}
          gridStyle={gridStyle}
        >
          {sc.events.map((ev) => (
            <StaticMarker
              key={ev.id}
              pct={(ev.monthIndex / horizon) * 100}
              color={SCENARIO_COLORS[sc.colorSlot]}
              repeatable={Boolean(ev.repeat)}
              title={eventTitle(
                `提前还款${ev.effect === 'shorten-term' ? '(缩期限)' : '(减月供)'}`,
                ev.amount,
                ev.monthIndex,
              )}
            />
          ))}
          {sc.events.length === 0 && (
            <EmptyHint text={`在左栏「⑥」为「${sc.name}」编排后显示在这里`} />
          )}
        </TrackRow>
      ))}

      {/* 循环段说明 */}
      <p className="mt-2 text-[10px] text-muted-foreground">
        菱形 = 引擎推导的关键节点；圆点 = 计划事件（右上小点表示循环执行）。
        本轨道为展示视图，修改请使用左栏「⑤⑥」编辑器。
      </p>
    </div>
  )
}

function TrackRow({
  label,
  dotColor,
  gridStyle,
  children,
}: {
  label: string
  dotColor?: string
  gridStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 border-b py-2 last:border-b-0">
      <span className="w-28 shrink-0 pt-0.5 truncate text-[11px] text-muted-foreground">
        {dotColor && (
          <span
            aria-hidden
            className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {label}
      </span>
      <div className="relative h-8 flex-1 rounded bg-muted/60" style={gridStyle}>
        {children}
      </div>
    </div>
  )
}

function StaticMarker({
  pct,
  color,
  title,
  repeatable,
}: {
  pct: number
  color: string
  title: string
  repeatable?: boolean
}) {
  return (
    <span
      title={`${title}${repeatable ? ' · 循环' : ''}`}
      aria-label={title}
      className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
    >
      <span
        className="block h-4 w-4 rounded-full border-2 border-background shadow"
        style={{ backgroundColor: color }}
      />
      {repeatable && (
        <span
          className="absolute -right-1 -top-1 block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground/60">
      {text}
    </span>
  )
}

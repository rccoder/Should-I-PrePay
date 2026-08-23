/**
 * 图表配色槽位与状态色（与 src/index.css 中的 CSS 变量一致）。
 * 方案分类色固定槽位：基准方案恒用 slot-1 蓝；颜色跟随实体（colorSlot）不跟随排名。
 * 状态色仅用于断裂点 / 预警徽章 / 宽心指数带位，绝不充当第五条系列色。
 */

export const SCENARIO_COLORS = {
  1: 'var(--chart-slot-1)',
  2: 'var(--chart-slot-2)',
  3: 'var(--chart-slot-3)',
  4: 'var(--chart-slot-4)',
} as const

export type ColorSlot = keyof typeof SCENARIO_COLORS

export const STATUS_COLORS = {
  good: 'var(--status-good)',
  warn: 'var(--status-warn)',
  severe: 'var(--status-severe)',
  danger: 'var(--status-danger)',
} as const

/** Recharts 公共样式常量 */
export const CHART_STYLE = {
  lineWidth: 2,
  gridStroke: 'var(--chart-grid)',
  /** 面积填充透明度（10% 水洗） */
  areaFillOpacity: 0.1,
} as const

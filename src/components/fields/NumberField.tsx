import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatPercent, wanToYuan, yuanToWan } from '@/lib/format'

/**
 * 受控数字输入三件套（M2 先用原生 input + shadcn 同款 Tailwind 样式，
 * M4 视需要替换为 shadcn Input/Slider 组合）。
 */

const inputCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

/** 金额输入：以「万元」显示，以「元」存储 */
export function MoneyInput({
  value,
  onChange,
  className,
  step = 1,
}: {
  value: number
  onChange: (yuan: number) => void
  className?: string
  step?: number
}) {
  const [text, setText] = useState(() => String(yuanToWan(value)))

  // 外部值变化（如滑块联动）时同步回显
  useEffect(() => {
    const wan = yuanToWan(value)
    setText((prev) => (Number(prev) === wan ? prev : String(wan)))
  }, [value])

  const commit = (raw: string) => {
    const num = Number(raw)
    if (Number.isFinite(num) && num >= 0) onChange(wanToYuan(num))
  }

  return (
    <div className={cn('relative', className)}>
      <input
        type="number"
        min={0}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value)
        }}
        className={cn(inputCls, 'pr-8')}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
        万
      </span>
    </div>
  )
}

/** 年金额输入：以「元」显示 */
export function YuanInput({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={cn(inputCls, 'pr-8')}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
        元
      </span>
    </div>
  )
}

/** 百分比输入：以 % 显示（1 位小数），以小数存储 */
export function PercentInput({
  value,
  onChange,
  className,
  allowNegative = false,
}: {
  value: number
  onChange: (ratio: number) => void
  className?: string
  allowNegative?: boolean
}) {
  const [text, setText] = useState(() => (value * 100).toFixed(2))

  useEffect(() => {
    const pct = (value * 100).toFixed(2)
    setText((prev) => (Number(prev) === Number(pct) ? prev : pct))
  }, [value])

  const commit = (raw: string) => {
    const num = Number(raw)
    if (Number.isFinite(num)) {
      const ratio = num / 100
      if (allowNegative || ratio >= 0) onChange(ratio)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        type="number"
        step={0.01}
        value={text}
        title={`当前 ${formatPercent(value, 2)}`}
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value)
        }}
        className={cn(inputCls, 'pr-7')}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
        %
      </span>
    </div>
  )
}

/** 整数输入（期数/年份等） */
export function IntInput({
  value,
  onChange,
  className,
  min,
  max,
  disabled,
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  min?: number
  max?: number
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <input
      type="number"
      step={1}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => {
        const v = Math.round(Number(e.target.value))
        if (!Number.isFinite(v)) return
        if (min !== undefined && v < min) return
        if (max !== undefined && v > max) return
        onChange(v)
      }}
      className={cn(inputCls, 'disabled:opacity-50', className)}
    />
  )
}

/** 文本输入 */
export function TextInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, className)}
    />
  )
}

/** 滑块 + 数值回显（拖动实时联动） */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-sm tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
      />
    </div>
  )
}

import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import {
  IntInput,
  MoneyInput,
  SliderField,
  TextInput,
} from '@/components/fields/NumberField'
import { formatMoney, formatPercent } from '@/lib/format'
import { estimateMonthlyPension } from '@/engine/pension'

/** 收入段编辑（年段、支持收入断崖）+ 年终奖 */
export function IncomeSegmentEditor() {
  const incomes = useAppStore((s) => s.incomes)
  const add = useAppStore((s) => s.addIncomeSegment)
  const update = useAppStore((s) => s.updateIncomeSegment)
  const remove = useAppStore((s) => s.removeIncomeSegment)

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        按年份段填写税后到手收入。收入骤降（失业/退休）直接把下一段调低即可。
      </p>
      {incomes.map((seg) => (
        <div key={seg.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <TextInput
              value={seg.label ?? ''}
              placeholder="阶段名称"
              onChange={(v) => update(seg.id, { label: v })}
              className="h-8 flex-1"
            />
            <YearRange
              start={seg.startYear}
              end={seg.endYear}
              onStart={(v) => update(seg.id, { startYear: v })}
              onEnd={(v) => update(seg.id, { endYear: v })}
            />
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => remove(seg.id)}>
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">年薪（万）</span>
              <MoneyInput value={seg.annualSalary} onChange={(v) => update(seg.id, { annualSalary: v })} />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">年终奖（万）</span>
              <MoneyInput value={seg.annualBonus} onChange={(v) => update(seg.id, { annualBonus: v })} />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">奖金发放月</span>
              <IntInput value={seg.bonusMonth} min={1} max={12} onChange={(v) => update(seg.id, { bonusMonth: v })} />
            </label>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        + 收入段
      </Button>
    </div>
  )
}

/** 退休后收入：可直接填、按通用公式离线粗估，或明确不计养老金。 */
export function RetirementIncomeEditor() {
  const global = useAppStore((s) => s.global)
  const incomes = useAppStore((s) => s.incomes)
  const setGlobal = useAppStore((s) => s.setGlobal)
  const mode = global.retirePensionMode ?? (global.retirePensionAnnual ? 'manual' : 'none')
  const estimate = estimateMonthlyPension(global, incomes)
  if (!global.retireYear) return <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">请先在「⓪ 全局设置」填写退休年，才能设置退休后收入。</p>
  return <section className="space-y-2">
    <span className="block text-sm font-medium">退休后养老金（{global.retireYear} 年起）</span>
    <div className="grid grid-cols-3 gap-1 rounded-md border p-1 text-xs">
      {([['manual', '我知道金额'], ['estimate', '通用公式估算'], ['none', '不计养老金']] as const).map(([value, label]) => <button key={value} onClick={() => setGlobal({ retirePensionMode: value })} className={`rounded px-2 py-1.5 ${mode === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{label}</button>)}
    </div>
    {mode === 'manual' && <Field label="预计每月到手养老金"><MoneyInput value={global.retirePensionMonthly ?? (global.retirePensionAnnual ?? 0) / 12} onChange={(value) => setGlobal({ retirePensionMonthly: value, retirePensionAnnual: value * 12 })} /></Field>}
    {mode === 'estimate' && <div className="space-y-2 rounded-md border bg-muted/25 p-2">
      <div className="grid grid-cols-2 gap-2"><Field label="预计累计缴费年限"><IntInput value={global.retirePensionContributionYears ?? 15} min={0} max={60} onChange={(value) => setGlobal({ retirePensionContributionYears: value })} /></Field><Field label="已知个人账户余额（可填0）"><MoneyInput value={global.retirePensionAccountBalance ?? 0} onChange={(value) => setGlobal({ retirePensionAccountBalance: value })} /></Field><Field label="年缴费基数上限（一般为社平3倍）"><MoneyInput value={global.retirePensionContributionBaseCapAnnual ?? 0} onChange={(value) => setGlobal({ retirePensionContributionBaseCapAnnual: value || undefined })} /></Field></div>
      <p className="font-medium text-foreground">粗估退休后每月养老金：约 {formatMoney(estimate)}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">估算逻辑：年薪不直接等于缴费基数。每年先用年薪估算缴费基数，超过你填写的<b className="text-foreground">年缴费基数上限</b>时按上限计算；该上限通常为参保地社平工资的三倍。基础养老金≈月平均基数×累计缴费年限×1%，个人账户养老金≈（已知账户余额＋未来缴费基数的8%）÷139。</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">上限填 0 时暂不封顶，可能高估高收入者；未纳入基数下限、历年缴费指数、账户利息、过渡性养老金及政策调整，实际以社保核定为准。</p>
    </div>}
    {mode === 'none' && <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">退休后不计入养老金收入，按更保守的现金流情形模拟。</p>}
  </section>
}

/** 支出编辑：固定支出多条 + 生活支出（可选通胀递增） */
export function ExpenseEditors() {
  const fixedExpenses = useAppStore((s) => s.fixedExpenses)
  const living = useAppStore((s) => s.living)
  const global = useAppStore((s) => s.global)
  const setGlobal = useAppStore((s) => s.setGlobal)
  const addFixed = useAppStore((s) => s.addFixedExpense)
  const updateFixed = useAppStore((s) => s.updateFixedExpense)
  const removeFixed = useAppStore((s) => s.removeFixedExpense)
  const addLiving = useAppStore((s) => s.addLivingSegment)
  const updateLiving = useAppStore((s) => s.updateLivingSegment)
  const removeLiving = useAppStore((s) => s.removeLivingSegment)

  return (
    <div className="space-y-4">
      {/* 生活支出 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">生活支出（动态）</span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={global.inflationEnabled}
              onChange={(e) => setGlobal({ inflationEnabled: e.target.checked })}
              className="accent-primary"
            />
            按通胀逐年递增
          </label>
        </div>
        {global.inflationEnabled && (
          <SliderField
            label="通胀率（拖动试探）"
            value={global.inflationRate}
            min={0}
            max={0.08}
            step={0.0025}
            onChange={(v) => setGlobal({ inflationRate: v })}
            format={(v) => formatPercent(v, 2)}
          />
        )}
        {living.map((seg) => (
          <div key={seg.id} className="flex items-center gap-2">
            <YearRange
              start={seg.startYear}
              end={seg.endYear}
              onStart={(v) => updateLiving(seg.id, { startYear: v })}
              onEnd={(v) => updateLiving(seg.id, { endYear: v })}
            />
            <MoneyInput
              value={seg.annualAmount}
              onChange={(v) => updateLiving(seg.id, { annualAmount: v })}
              className="w-24"
            />
            <span className="shrink-0 text-xs text-muted-foreground">万/年</span>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => removeLiving(seg.id)}>
              ✕
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addLiving}>
          + 生活支段
        </Button>
      </div>

      {/* 固定支出 */}
      <div className="space-y-2">
        <span className="text-sm font-medium">固定支出</span>
        {fixedExpenses.map((item) => (
          <div key={item.id} className="rounded-lg border p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <TextInput
                value={item.name}
                onChange={(v) => updateFixed(item.id, { name: v })}
                className="h-8 flex-1"
                placeholder="物业费/车位/保险…"
              />
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => removeFixed(item.id)}>
                ✕
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <YearRange
                start={item.startYear}
                end={item.endYear}
                onStart={(v) => updateFixed(item.id, { startYear: v })}
                onEnd={(v) => updateFixed(item.id, { endYear: v })}
              />
              <MoneyInput
                value={item.annualAmount}
                onChange={(v) => updateFixed(item.id, { annualAmount: v })}
                className="w-24"
              />
              <span className="shrink-0 text-xs text-muted-foreground">元/年</span>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addFixed}>
          + 固定支出项
        </Button>
      </div>
    </div>
  )
}

function YearRange({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: number
  end: number
  onStart: (v: number) => void
  onEnd: (v: number) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 text-xs">
      <IntInput value={start} min={1990} max={2120} onChange={onStart} className="h-8 w-[4.5rem]" />
      <span className="text-muted-foreground">–</span>
      <IntInput value={end} min={1990} max={2120} onChange={onEnd} className="h-8 w-[4.5rem]" />
      <span className="text-muted-foreground">年</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="block text-xs text-muted-foreground">{label}</span>{children}</label>
}

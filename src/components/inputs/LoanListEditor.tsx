import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import {
  IntInput,
  MoneyInput,
  PercentInput,
  TextInput,
} from '@/components/fields/NumberField'
import { initLoanState, peekScheduled } from '@/engine/loan'
import { formatMoney } from '@/lib/format'
import type { LoanInput } from '@/engine/types'

/**
 * 贷款列表：分「房贷」与「其他贷款」两组。
 * 公积金只能用于房贷（月冲与提前还款都受此限制，引擎强制）；车贷等其他贷款只能用自有资金。
 */
export function LoanListEditor() {
  const loans = useAppStore((s) => s.loans)
  const addLoan = useAppStore((s) => s.addLoan)
  const removeLoan = useAppStore((s) => s.removeLoan)

  const housingLoans = loans.filter((l) => l.kind !== 'other')
  const otherLoans = loans.filter((l) => l.kind === 'other')

  return (
    <div className="space-y-4">
      {/* 房贷 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">房贷</span>
          <span className="text-[10px] text-muted-foreground">可用公积金月冲与提前还款</span>
        </div>
        {housingLoans.map((loan) => (
          <LoanCard key={loan.id} loan={loan} onRemove={() => removeLoan(loan.id)} />
        ))}
        {housingLoans.length === 0 && (
          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
            还没有房贷。组合贷 = 商业贷款 + 公积金贷款各填一笔。
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => addLoan('commercial')}>
            + 商业贷款
          </Button>
          <Button variant="outline" size="sm" onClick={() => addLoan('fund')}>
            + 公积金贷款
          </Button>
        </div>
      </section>

      {/* 其他贷款 */}
      <section className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">其他贷款</span>
          <span className="text-[10px] text-muted-foreground">不能使用公积金，只能用自有资金</span>
        </div>
        {otherLoans.map((loan) => (
          <LoanCard key={loan.id} loan={loan} onRemove={() => removeLoan(loan.id)} />
        ))}
        <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          想提前还车贷？到下方「⑥ 提前还款计划」新增一段，把「还给谁」选成这笔贷款即可
          （资金来源用现金或理财；利率比房贷高时，现金来源的「自动」也会优先还它）。
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => addLoan('other')} title="预填常见车贷：15 万 / 3 年 / 4.5%">
            + 车贷
          </Button>
        </div>
      </section>
    </div>
  )
}

function LoanCard({ loan, onRemove }: { loan: LoanInput; onRemove: () => void }) {
  const updateLoan = useAppStore((s) => s.updateLoan)
  const addRateRule = useAppStore((s) => s.addRateRule)
  const updateRateRule = useAppStore((s) => s.updateRateRule)
  const removeRateRule = useAppStore((s) => s.removeRateRule)

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <TextInput
          value={loan.name}
          onChange={(v) => updateLoan(loan.id, { name: v })}
          className="h-8 flex-1"
        />
        {/* 月供概览（只读，随下方参数实时变化） */}
        <span
          className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground"
          title={`本金 ${formatMoney(loan.principal)} · 剩余 ${loan.remainingMonths} 个月`}
        >
          月供≈{formatMoney(peekScheduled(initLoanState(loan), loan.currentRate).payment)}
          {loan.method === 'linear' ? '(首月)' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`删除 ${loan.name}`}>
          删除
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="剩余本金">
          <MoneyInput value={loan.principal} onChange={(v) => updateLoan(loan.id, { principal: v })} />
        </Field>
        <Field label="剩余期限（月）">
          <IntInput value={loan.remainingMonths} min={1} max={600} onChange={(v) => updateLoan(loan.id, { remainingMonths: v })} />
        </Field>
        <Field label="当前执行利率">
          <PercentInput value={loan.currentRate} onChange={(v) => updateLoan(loan.id, { currentRate: v })} />
        </Field>
        <Field label="还款方式">
          <select
            value={loan.method}
            onChange={(e) =>
              updateLoan(loan.id, { method: e.target.value as 'annuity' | 'linear' })
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="annuity">等额本息</option>
            <option value="linear">等额本金</option>
          </select>
        </Field>
        <Field label="提前还款违约金比例">
          <PercentInput
            value={loan.prepayPenaltyRate ?? 0}
            onChange={(v) => updateLoan(loan.id, { prepayPenaltyRate: v })}
          />
        </Field>
        <Field label="放款时间（第几月起还，0=立即）">
          <IntInput
            value={loan.startDelayMonths ?? 0}
            min={0}
            max={600}
            onChange={(v) => updateLoan(loan.id, { startDelayMonths: v })}
          />
        </Field>
      </div>

      {/* 未来利率预期：直接填该阶段的执行利率 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">未来利率预期（按年生效）</span>
          <Button variant="outline" size="sm" onClick={() => addRateRule(loan.id)}>
            + 阶段
          </Button>
        </div>
        {loan.rateRules.map((rule, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="shrink-0 text-muted-foreground">第</span>
            <IntInput
              value={rule.startAfterYear}
              min={0}
              max={50}
              onChange={(v) => updateRateRule(loan.id, i, { startAfterYear: v })}
              className="h-8 w-16"
            />
            <span className="shrink-0 text-muted-foreground">年起利率</span>
            <PercentInput
              value={rule.annualRate}
              onChange={(v) => updateRateRule(loan.id, i, { annualRate: v })}
              className="w-24"
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2"
              onClick={() => removeRateRule(loan.id, i)}
              aria-label="删除阶段"
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

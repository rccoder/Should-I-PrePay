import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import {
  IntInput,
  MoneyInput,
  PercentInput,
  SliderField,
  TextInput,
} from '@/components/fields/NumberField'
import { formatPercent } from '@/lib/format'
import { formatMoney } from '@/lib/format'
import { makeId } from '@/engine/ids'
import { fundAnnualContributionAt } from '@/engine/fund'
import type { AnalysisResult } from '@/engine/types'

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** 资产账户编辑：活钱 / 理财池×N / 公积金 */
export function AccountEditors({ result }: { result: AnalysisResult }) {
  const cash = useAppStore((s) => s.cash)
  const pools = useAppStore((s) => s.pools)
  const fund = useAppStore((s) => s.fund)
  const global = useAppStore((s) => s.global)
  const updateCash = useAppStore((s) => s.updateCash)
  const addPool = useAppStore((s) => s.addPool)
  const updatePool = useAppStore((s) => s.updatePool)
  const removePool = useAppStore((s) => s.removePool)
  const updateFund = useAppStore((s) => s.updateFund)
  const addFundContributionSegment = useAppStore((s) => s.addFundContributionSegment)
  const updateFundContributionSegment = useAppStore((s) => s.updateFundContributionSegment)
  const removeFundContributionSegment = useAppStore((s) => s.removeFundContributionSegment)
  const setFundAccount = useAppStore((s) => s.setFundAccount)
  const setGlobal = useAppStore((s) => s.setGlobal)
  const fundMonthlyOffset = global.fundMonthlyOffset !== false
  const loans = useAppStore((s) => s.loans)

  // 公积金时间线文案：缴存实际截止于最后一个区间与退休年中较早者。
  const contribEndYear = Math.max(...(fund?.contributionSegments?.map((s) => s.endYear) ?? [global.startYear]))
  const effectiveEndYear =
    global.retireYear != null
      ? Math.min(global.retireYear, contribEndYear)
      : contribEndYear
  const contributeUntilText = fund ? String(effectiveEndYear) : ''
  const processAtLabel = global.retireYear
    ? `可提取时点：${global.retireYear} 年（退休）——届时余额怎么处理？`
    : '停止缴存后，余额怎么处理？（在「⓪ 全局设置」里填退休年后，将改到退休时处理）'
  const baselineSnap = result.outcomes[result.baselineId]?.base.snaps[0]
  const currentFundContribution = fund ? fundAnnualContributionAt(fund, global.startYear) / 12 : 0
  const currentHousingDue = baselineSnap?.loans
    .filter((snap) => loans.find((loan) => loan.id === snap.loanId)?.kind !== 'other')
    .reduce((sum, snap) => sum + snap.scheduledPayment, 0) ?? 0
  const monthlyFundGap = Math.max(0, currentHousingDue - currentFundContribution)
  const bufferMonths = monthlyFundGap > 0 && fund ? fund.initialBalance / monthlyFundGap : Infinity

  return (
    <div className="space-y-4">
      {/* 活钱 */}
      <div className="space-y-2">
        <span className="text-sm font-medium">活钱（活期）</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">初始金额</span>
            <MoneyInput value={cash.initialBalance} onChange={(v) => updateCash({ initialBalance: v })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">初始全部转入</span>
            <select
              value={cash.sweepToPoolId ?? ''}
              onChange={(e) => updateCash({ sweepToPoolId: e.target.value || undefined })}
              className={selectCls}
            >
              <option value="">留在活钱</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 理财池 */}
      <div className="space-y-2">
        <span className="text-sm font-medium">理财池</span>
        {pools.map((pool) => (
          <div key={pool.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <TextInput
                value={pool.name}
                onChange={(v) => updatePool(pool.id, { name: v })}
                className="h-8 flex-1"
              />
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => removePool(pool.id)}>
                ✕
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="预期年化">
                <PercentInput value={pool.expectedAnnualReturn} onChange={(v) => updatePool(pool.id, { expectedAnnualReturn: v })} />
              </Field>
              <Field label="最大亏损">
                <PercentInput value={pool.maxLossPct} onChange={(v) => updatePool(pool.id, { maxLossPct: v })} />
              </Field>
              <Field label="风险档">
                <select
                  value={pool.riskLevel}
                  onChange={(e) =>
                    updatePool(pool.id, { riskLevel: e.target.value as 'high' | 'medium' | 'low' })
                  }
                  className={selectCls}
                >
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                </select>
              </Field>
            </div>
            <Field label="初始金额">
              <MoneyInput value={pool.initialBalance} onChange={(v) => updatePool(pool.id, { initialBalance: v })} />
            </Field>
            <SliderField
              label="预期年化（拖动实时看结论变化）"
              value={pool.expectedAnnualReturn}
              min={0}
              max={0.12}
              step={0.002}
              onChange={(v) => updatePool(pool.id, { expectedAnnualReturn: v })}
              format={(v) => formatPercent(v, 1)}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => addPool('high')}>
            + 高风险
          </Button>
          <Button variant="outline" size="sm" onClick={() => addPool('medium')}>
            + 中风险
          </Button>
          <Button variant="outline" size="sm" onClick={() => addPool('low')}>
            + 低风险
          </Button>
        </div>
      </div>

      {/* 公积金 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">公积金</span>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={fund !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  setFundAccount({
                    initialBalance: 50_000,
                    contributionSegments: [
                      { id: makeId(), startYear: global.startYear, endYear: global.startYear + 19, annualAmount: 48_000 },
                    ],
                    interestRate: 0.015,
                    maturityPolicy: 'withdrawToWealth',
                    maturityPrepayEffect: 'shorten-term',
                    withdrawToPoolId: pools[0]?.id,
                  })
                } else {
                  setFundAccount(null)
                }
              }}
              className="accent-primary"
            />
            启用
          </label>
        </div>
        {fund && (
          <div className="rounded-lg border p-3 space-y-2.5">
            {/* 三种用法说明 */}
            <ol className="space-y-1 rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">① 月冲</b>
                ：每月房贷月供先从公积金余额里扣，不够的自动用活钱补，用不完的留在公积金计息。
                是否启用见下方「房贷月供资金策略」。
              </li>
              <li>
                <b className="text-foreground">② 提前还款</b>
                ：在下方「⑥ 提前还款计划」把资金来源选成公积金即可，把公积金余额一次性冲进房贷。
              </li>
              <li>
                <b className="text-foreground">③ 不动它</b>
                ：一直放着计息，到可提取时点（退休年）再按下面的方式处理。
              </li>
            </ol>

            {fundMonthlyOffset && currentHousingDue > 0 && (
              <div className={`rounded-md border p-2 text-[11px] leading-relaxed ${monthlyFundGap > 0 ? 'border-status-severe/30 bg-status-severe/8' : 'border-status-good/30 bg-status-good/8'}`}>
                <p className="font-medium text-foreground">公积金月冲缓冲判断</p>
                <p className="mt-0.5 text-muted-foreground">
                  每月缴存约 {formatMoney(currentFundContribution)}，当前房贷月供约 {formatMoney(currentHousingDue)}。
                  {monthlyFundGap > 0 ? (
                    <> 每月仍差约 <b className="text-status-severe">{formatMoney(monthlyFundGap)}</b>，当前公积金余额是在替未来月供补这个缺口的缓冲垫（约 {Math.floor(bufferMonths)} 个月）。年底全部年冲后，这个缺口会更早改由活钱承担。</>
                  ) : (
                    <> 每月可多出约 <b className="text-status-good">{formatMoney(currentFundContribution - currentHousingDue)}</b>，这部分会积累成真正可用于年底年冲的余额，通常不会挤占活钱。</>
                  )}
                </p>
              </div>
            )}

            {/* 房贷月供资金策略 */}
            <div className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">房贷月供资金策略</span>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs hover:bg-accent/50">
                <input
                  type="radio"
                  name="fund-offset-strategy"
                  checked={fundMonthlyOffset}
                  onChange={() => setGlobal({ fundMonthlyOffset: true })}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <b>优先公积金月冲</b>（推荐）——月供先扣公积金，不够的活钱补。
                  数学上几乎总是更优：这笔钱不能取出来投资，冲进贷款相当于赚到贷款利率。
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs hover:bg-accent/50">
                <input
                  type="radio"
                  name="fund-offset-strategy"
                  checked={!fundMonthlyOffset}
                  onChange={() => setGlobal({ fundMonthlyOffset: false })}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <b>全部用活钱付</b>——公积金只攒着不动。仅供对比：攒着只有约 1.5% 计息，
                  而少还的房贷本金值 3%+。
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="当前余额">
                <MoneyInput value={fund.initialBalance} onChange={(v) => updateFund({ initialBalance: v })} />
              </Field>
              <Field label="余额计息利率">
                <PercentInput value={fund.interestRate} onChange={(v) => updateFund({ interestRate: v })} />
              </Field>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">缴存计划（个人+单位）</span>
                <Button variant="outline" size="sm" className="h-7" onClick={addFundContributionSegment}>+ 新增阶段</Button>
              </div>
              {(fund.contributionSegments ?? []).map((segment) => (
                <div key={segment.id} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-1.5">
                  <IntInput value={segment.startYear} min={1990} max={2120} onChange={(v) => updateFundContributionSegment(segment.id, { startYear: v })} />
                  <IntInput value={segment.endYear} min={1990} max={2120} onChange={(v) => updateFundContributionSegment(segment.id, { endYear: v })} />
                  <MoneyInput value={segment.annualAmount} onChange={(v) => updateFundContributionSegment(segment.id, { annualAmount: v })} />
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => removeFundContributionSegment(segment.id)}>✕</Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">每行依次为起始年、结束年、年缴存额；未覆盖的年份视为不再缴存。{contributeUntilText ? ` 当前最晚缴存到 ${contributeUntilText} 年。` : ''}</p>
            </div>

            <Field label={processAtLabel}>
              <select
                value={fund.maturityPolicy}
                onChange={(e) =>
                  updateFund({ maturityPolicy: e.target.value as never })
                }
                className={selectCls}
              >
                <option value="hold">留在公积金账户，继续计息（等以后再说）</option>
                <option value="withdrawToWealth">一次性取出，转入理财池</option>
                <option value="lumpPrepay">一次性冲抵贷款</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {fund.maturityPolicy === 'lumpPrepay' && (
                <Field label="冲抵效果">
                  <select
                    value={fund.maturityPrepayEffect}
                    onChange={(e) =>
                      updateFund({ maturityPrepayEffect: e.target.value as never })
                    }
                    className={selectCls}
                  >
                    <option value="shorten-term">缩短期限</option>
                    <option value="reduce-payment">减少月供</option>
                  </select>
                </Field>
              )}
              {fund.maturityPolicy === 'withdrawToWealth' && (
                <Field label="转入理财池">
                  <select
                    value={fund.withdrawToPoolId ?? ''}
                    onChange={(e) => updateFund({ withdrawToPoolId: e.target.value || undefined })}
                    className={selectCls}
                  >
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </div>
        )}
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

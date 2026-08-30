import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IntInput, MoneyInput, TextInput } from '@/components/fields/NumberField'
import { makeId } from '@/engine/ids'
import { presetFundYearlyPrepay, presetCashYearlyPrepay } from '@/engine/presets'
import { initLoanState, peekScheduled } from '@/engine/loan'
import { formatMoney } from '@/lib/format'
import type {
  BigExpenseEvent,
  BigIncomeEvent,
  Id,
  LifeEvent,
  LoanInput,
  PeriodicInvestEvent,
  PrepayEvent,
} from '@/engine/types'

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** 相对月序 ↔ 「第N年M月」（相对模拟起点）显示 */
function MonthField({
  value,
  onChange,
}: {
  value: number
  onChange: (monthIndex: number) => void
}) {
  const yearOffset = Math.floor(value / 12)
  const calMonth = (value % 12) + 1
  return (
    <div className="flex items-center gap-1">
      <span className="shrink-0 text-xs text-muted-foreground">第</span>
      <IntInput
        value={yearOffset}
        min={0}
        max={50}
        onChange={(y) => onChange(y * 12 + (value % 12))}
        className="h-8 w-14"
      />
      <span className="shrink-0 text-xs text-muted-foreground">年</span>
      <select
        value={calMonth}
        onChange={(e) => onChange(yearOffset * 12 + (Number(e.target.value) - 1))}
        className={selectCls}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}月
          </option>
        ))}
      </select>
    </div>
  )
}

/** 公共人生事件编辑：大额支出 / 大额收入 / 年度定投 */
export function LifeEventEditor() {
  const lifeEvents = useAppStore((s) => s.lifeEvents)
  const pools = useAppStore((s) => s.pools)
  const addLifeEvent = useAppStore((s) => s.addLifeEvent)
  const updateLifeEvent = useAppStore((s) => s.updateLifeEvent)
  const removeLifeEvent = useAppStore((s) => s.removeLifeEvent)
  const [tab, setTab] = useState<'expense' | 'income' | 'invest'>('expense')

  const shown = lifeEvents.filter((e) =>
    tab === 'expense' ? e.type === 'big-expense' : tab === 'income' ? e.type === 'big-income' : e.type === 'invest',
  )

  const addExpense = () => {
    const ev: BigExpenseEvent = {
      id: makeId(),
      type: 'big-expense',
      monthIndex: 24,
      label: '买车',
      amount: 200_000,
      source: 'cash',
    }
    addLifeEvent(ev)
  }
  const addIncome = () => {
    const ev: BigIncomeEvent = {
      id: makeId(),
      type: 'big-income',
      monthIndex: 120,
      label: '卖旧房',
      amount: 500_000,
      target: 'cash',
    }
    addLifeEvent(ev)
  }
  const addInvest = () => {
    if (pools.length === 0) return
    const ev: PeriodicInvestEvent = {
      id: makeId(),
      type: 'invest',
      monthIndex: 0,
      monthOfYear: 12,
      amount: 100_000,
      poolId: pools[0]!.id,
    }
    addLifeEvent(ev)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(
          [
            ['expense', '大额支出'],
            ['income', '大额收入'],
            ['invest', '年度定投'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              tab === key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="text-xs text-muted-foreground">暂无。人生大事（买车/装修/教育/卖房…）对所有方案同样发生，在这里登记一次即可。</p>
      )}

      {shown.map((ev: LifeEvent) => (
        <div key={ev.id} className="rounded-lg border p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            {ev.type !== 'invest' && (
              <TextInput
                value={ev.label}
                onChange={(v) => updateLifeEvent(ev.id, { label: v })}
                className="h-8 flex-1"
                placeholder="名称"
              />
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => removeLifeEvent(ev.id)}>
              ✕
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {ev.type === 'invest' ? (
              <>
                <span className="text-muted-foreground">每年</span>
                <select
                  value={ev.monthOfYear}
                  onChange={(e) =>
                    updateLifeEvent(ev.id, { monthOfYear: Number(e.target.value) })
                  }
                  className={`${selectCls} w-auto`}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}月
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <MonthField value={ev.monthIndex} onChange={(v) => updateLifeEvent(ev.id, { monthIndex: v })} />
            )}
            <MoneyInput
              value={ev.amount}
              onChange={(v) => updateLifeEvent(ev.id, { amount: v })}
              className="w-28"
            />
            {ev.type === 'big-income' ? (
              <select
                value={ev.target}
                onChange={(e) =>
                  updateLifeEvent(ev.id, { target: e.target.value as never })
                }
                className={`${selectCls} w-auto`}
              >
                <option value="cash">进活钱</option>
                {pools.map((p) => (
                  <option key={p.id} value="wealth">
                    进{p.name}
                  </option>
                ))}
              </select>
            ) : null}
            {ev.type === 'big-expense' && (
              <select
                value={ev.source === 'wealth' ? `wealth:${ev.wealthPoolId ?? ''}` : ev.source}
                onChange={(e) => {
                  const v = e.target.value
                  if (v.startsWith('wealth:')) {
                    updateLifeEvent(ev.id, { source: 'wealth', wealthPoolId: v.slice(7) || undefined })
                  } else {
                    updateLifeEvent(ev.id, { source: v as never, wealthPoolId: undefined })
                  }
                }}
                className={`${selectCls} w-auto`}
              >
                <option value="cash">从活钱扣</option>
                {pools.map((p) => (
                  <option key={p.id} value={`wealth:${p.id}`}>
                    从{p.name}扣
                  </option>
                ))}
              </select>
            )}
            {ev.type === 'invest' && (
              <select
                value={ev.poolId}
                onChange={(e) => updateLifeEvent(ev.id, { poolId: e.target.value })}
                className={`${selectCls} w-auto`}
              >
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    投入{p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        {tab === 'expense' && (
          <Button variant="outline" size="sm" onClick={addExpense}>
            + 大额支出
          </Button>
        )}
        {tab === 'income' && (
          <Button variant="outline" size="sm" onClick={addIncome}>
            + 大额收入
          </Button>
        )}
        {tab === 'invest' && (
          <Button variant="outline" size="sm" onClick={addInvest} disabled={pools.length === 0}>
            + 定投计划
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 提前还款计划：房贷作为一个整体（组合贷自动分配）+ 其他贷款按实际添加逐个出现
// ---------------------------------------------------------------------------

export function ScenarioPrepayEditor() {
  const scenarios = useAppStore((s) => s.scenarios)
  const loans = useAppStore((s) => s.loans)
  const fund = useAppStore((s) => s.fund)
  const startMonth = useAppStore((s) => s.global.startMonth)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const setActiveScenario = useAppStore((s) => s.setActiveScenario)
  const addEvent = useAppStore((s) => s.addEvent)
  const setScenarioEvents = useAppStore((s) => s.setScenarioEvents)

  const editable = scenarios.find((x) => x.id === activeScenarioId && !x.isBaseline)
    ?? scenarios.find((x) => !x.isBaseline)

  if (!editable) {
    return (
      <p className="text-xs text-muted-foreground">
        先在上方「+ 方案」新建一个提前还款方案，再为它编排还款节奏。
      </p>
    )
  }

  const applyPreset = (preset: 'fund-yearly' | 'full-yearly') => {
    if (preset === 'fund-yearly') {
      setScenarioEvents(editable.id, presetFundYearlyPrepay(startMonth))
    } else {
      setScenarioEvents(editable.id, [
        ...presetFundYearlyPrepay(startMonth),
        ...presetCashYearlyPrepay(200_000, 'shorten-term', startMonth),
      ])
    }
  }

  const addHousingSegment = () =>
    addEvent(editable.id, {
      id: makeId(),
      type: 'prepay',
      monthIndex: 12,
      amount: 200_000,
      effect: 'reduce-payment',
      targetGroup: 'housing', // 默认当作「还房贷」，引擎在房贷内部自动挑利率最高的
      source: 'cash',
    })

  const addOtherSegment = (loanId: Id) =>
    addEvent(editable.id, {
      id: makeId(),
      type: 'prepay',
      monthIndex: 24,
      amount: 50_000,
      effect: 'shorten-term',
      targetLoanId: loanId, // 其他贷款精确到笔，且不能用公积金
      source: 'cash',
    })

  const housingLoans = loans.filter((l) => l.kind !== 'other')
  const otherLoans = loans.filter((l) => l.kind === 'other')
  const housingIds = new Set(housingLoans.map((l) => l.id))
  // 归入「房贷」组：显式 targetGroup=housing、无目标的段，以及明确指向某笔房贷的段
  const housingEvents = editable.events.filter(
    (e) => e.targetGroup === 'housing' || !e.targetLoanId || housingIds.has(e.targetLoanId),
  )

  // 房贷月供合计概览（首期）
  const housingFirstPayment = housingLoans.reduce(
    (sum, l) => sum + peekScheduled(initLoanState(l), l.currentRate).payment,
    0,
  )

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
        默认第 3 个方案由「公积金年冲」和「额外还房贷」两条计划组成。可新增多条不同年份和金额的还款段；若要还车贷等其他贷款，在下方对应贷款区块添加即可。
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">正在编辑</span>
        <select
          value={editable.id}
          onChange={(e) => setActiveScenario(e.target.value)}
          className={`${selectCls} h-8 flex-1`}
        >
          {scenarios
            .filter((x) => !x.isBaseline)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </div>

      {/* 房贷组：组合贷作为一个整体 */}
      <div className="rounded-lg border p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            房贷
            <Badge variant="secondary">商贷+公积金贷自动分配</Badge>
          </span>
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
            title="两笔房贷首期月供合计；提前还款默认先冲利率最高的一笔"
          >
            月供≈{formatMoney(housingFirstPayment)}/月
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          把房贷当成一笔来配。每段的「还给谁」默认为自动——先还利率高的那笔（通常是商贷）；
          也可以在下拉里固定只还某一笔。
        </p>
        {housingEvents.map((ev) => (
          <RepaySegmentCard
            key={ev.id}
            ev={ev}
            scenarioId={editable.id}
            mode="housing"
            housingLoans={housingLoans}
          />
        ))}
        <Button variant="outline" size="sm" onClick={addHousingSegment}>
          + 给房贷加提前还款段
        </Button>
      </div>

      {/* 其他贷款组：按实际添加的贷款逐个出现 */}
      <div className="space-y-2 border-t pt-2">
        <span className="text-[11px] text-muted-foreground">
          其他贷款（不能用公积金；在左侧「① 贷款」里加了什么，这里就有什么）
        </span>
        {otherLoans.length === 0 && (
          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
            暂无其他贷款。
          </p>
        )}
        {otherLoans.map((loan) => (
          <OtherLoanPlanSection
            key={loan.id}
            loan={loan}
            events={editable.events.filter((e) => e.targetLoanId === loan.id)}
            onAdd={() => addOtherSegment(loan.id)}
            scenarioId={editable.id}
          />
        ))}
      </div>

      {/* 预设模板 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        <span className="text-[11px] text-muted-foreground">快捷模板（覆盖本方案全部还款段）</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!fund || fund.initialBalance <= 0}
          onClick={() => applyPreset('fund-yearly')}
          title="每年 12 月月冲后，用公积金账户全部剩余余额冲抵房贷"
        >
          公积金年冲
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => applyPreset('full-yearly')}
          title="每年 12 月公积金年冲，再额外还 20 万房贷（可再手动改区间和金额）"
        >
          每年多还20万
        </Button>
      </div>
    </div>
  )
}

/** 其他单笔贷款的还款区块 */
function OtherLoanPlanSection({
  loan,
  events,
  onAdd,
  scenarioId,
}: {
  loan: LoanInput
  events: PrepayEvent[]
  onAdd: () => void
  scenarioId: Id
}) {
  const firstPayment = peekScheduled(initLoanState(loan), loan.currentRate).payment
  return (
    <div className="rounded-lg border p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {loan.name}
          <Badge variant="secondary">非房贷</Badge>
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          月供≈{formatMoney(firstPayment)}
          {loan.method === 'linear' ? '(首月，逐月递减)' : '/月'}
        </span>
      </div>
      {events.map((ev) => (
        <RepaySegmentCard key={ev.id} ev={ev} scenarioId={scenarioId} mode="pinned" />
      ))}
      <Button variant="outline" size="sm" onClick={onAdd}>
        + 给「{loan.name}」加提前还款段
      </Button>
    </div>
  )
}

/** 一条提前还款段：时间区间 / 金额效果 / 目标与来源 */
function RepaySegmentCard({
  ev,
  scenarioId,
  mode,
  housingLoans = [],
}: {
  ev: PrepayEvent
  scenarioId: Id
  mode: 'housing' | 'pinned'
  housingLoans?: LoanInput[]
}) {
  const updateEvent = useAppStore((s) => s.updateEvent)
  const removeEvent = useAppStore((s) => s.removeEvent)
  const pools = useAppStore((s) => s.pools)
  const startMonth = useAppStore((s) => s.global.startMonth)

  const freq = ev.repeat?.everyMonths ? ('m6' as const) : ev.repeat ? ('y1' as const) : ('once' as const)
  const calendarMonthAt = (monthIndex: number) => ((startMonth - 1 + monthIndex) % 12) + 1
  const calendarYearRelAt = (monthIndex: number) => Math.floor((startMonth - 1 + monthIndex) / 12)
  const monthIndexAt = (yearRel: number, monthOfYear: number) =>
    yearRel * 12 + monthOfYear - startMonth
  const anchorMonth = ev.repeat?.monthOfYear ?? calendarMonthAt(ev.monthIndex)
  const startYearRel = calendarYearRelAt(ev.monthIndex)
  const untilYearRel =
    ev.repeat?.untilMonth !== undefined ? calendarYearRelAt(ev.repeat.untilMonth) : undefined

  const setFreq = (v: 'once' | 'y1' | 'm6') => {
    if (v === 'once') {
      updateEvent(scenarioId, ev.id, { repeat: undefined })
    } else if (v === 'y1') {
      updateEvent(scenarioId, ev.id, { repeat: { everyYears: 1, monthOfYear: anchorMonth } })
    } else {
      updateEvent(scenarioId, ev.id, { repeat: { everyMonths: 6 } })
    }
  }
  const setAnchorMonthOfYear = (mo: number) => {
    updateEvent(scenarioId, ev.id, {
      monthIndex: monthIndexAt(startYearRel, mo),
      repeat:
        freq === 'y1'
          ? { ...(ev.repeat ?? { everyYears: 1 }), everyYears: 1, monthOfYear: mo }
          : ev.repeat,
    })
  }
  const setStartYearRel = (y: number) => {
    updateEvent(scenarioId, ev.id, {
      monthIndex: monthIndexAt(y, freq === 'once' ? calendarMonthAt(ev.monthIndex) : anchorMonth),
    })
  }
  const setUntilYearRel = (y: number) => {
    if (!Number.isFinite(y)) {
      const { untilMonth: _drop, ...rest } = ev.repeat ?? {}
      const hasRest = Object.keys(rest).length > 0
      updateEvent(scenarioId, ev.id, { repeat: hasRest ? rest : undefined })
      return
    }
    if (!ev.repeat) return
    updateEvent(scenarioId, ev.id, {
      repeat: { ...ev.repeat, untilMonth: monthIndexAt(y, anchorMonth) },
    })
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
      {/* 时间区间 */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
        <select
          value={freq}
          onChange={(e) => setFreq(e.target.value as 'once' | 'y1' | 'm6')}
          className={`${selectCls} h-7 w-auto`}
        >
          <option value="once">仅一次</option>
          <option value="y1">每年一次</option>
          <option value="m6">每半年</option>
        </select>
        {freq === 'once' ? (
          <>
            <span className="text-muted-foreground">在第</span>
            <IntInput
              value={startYearRel}
              min={0}
              max={50}
              onChange={setStartYearRel}
              className="h-6 w-12"
            />
            <span className="text-muted-foreground">年</span>
            <select
              value={calendarMonthAt(ev.monthIndex)}
              onChange={(e) =>
                updateEvent(scenarioId, ev.id, {
                  monthIndex: monthIndexAt(startYearRel, Number(e.target.value)),
                })
              }
              className={`${selectCls} h-7 w-auto`}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}月
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">第</span>
            <IntInput
              value={startYearRel}
              min={0}
              max={50}
              onChange={setStartYearRel}
              className="h-6 w-12"
            />
            <span className="text-muted-foreground">年起，至第</span>
            <IntInput
              value={untilYearRel ?? NaN}
              min={0}
              max={50}
              placeholder="终点"
              onChange={setUntilYearRel}
              className="h-6 w-12"
            />
            <span className="text-muted-foreground">
              年止{untilYearRel === undefined ? '（不填=一直还到还清）' : ''}
            </span>
            {freq === 'y1' && (
              <>
                <span className="text-muted-foreground">· 每年</span>
                <select
                  value={anchorMonth}
                  onChange={(e) => setAnchorMonthOfYear(Number(e.target.value))}
                  className={`${selectCls} h-7 w-auto`}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}月
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>

      {/* 金额 / 效果 / 目标与来源 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <MoneyInput
          value={ev.amount}
          onChange={(v) => updateEvent(scenarioId, ev.id, { amount: v })}
          className="w-24"
        />
        <select
          value={ev.effect}
          onChange={(e) =>
            updateEvent(scenarioId, ev.id, { effect: e.target.value as never })
          }
          className={`${selectCls} h-7 w-auto`}
        >
          <option value="shorten-term">缩短期限</option>
          <option value="reduce-payment">减少月供</option>
        </select>

        {mode === 'housing' ? (
          <select
            value={ev.targetLoanId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              updateEvent(scenarioId, ev.id, {
                targetLoanId: v || undefined,
                targetGroup: v ? undefined : 'housing',
              })
            }}
            className={`${selectCls} h-7 w-auto`}
            title="自动 = 在房贷内部先还当前利率最高的一笔"
          >
            <option value="">自动：先还利率高的</option>
            {housingLoans.map((l) => (
              <option key={l.id} value={l.id}>
                只还{l.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={ev.source === 'wealth' ? `wealth:${ev.wealthPoolId ?? ''}` : ev.source}
          onChange={(e) => {
            const v = e.target.value
            if (v.startsWith('wealth:')) {
              updateEvent(scenarioId, ev.id, {
                source: 'wealth',
                wealthPoolId: v.slice(7) || undefined,
              })
            } else {
              updateEvent(scenarioId, ev.id, { source: v as never, wealthPoolId: undefined })
            }
          }}
          className={`${selectCls} h-7 w-auto`}
        >
          <option value="cash">现金</option>
          {pools.map((p) => (
            <option key={p.id} value={`wealth:${p.id}`}>
              理财·{p.name}
            </option>
          ))}
          {mode === 'housing' && <option value="fund">公积金余额（推荐优先）</option>}
        </select>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-1.5"
          onClick={() => removeEvent(scenarioId, ev.id)}
        >
          ✕
        </Button>
      </div>
    </div>
  )
}

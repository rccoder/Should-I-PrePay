import type {
  AnalysisInput,
  Id,
  LoanInput,
  LoanSnap,
  MonthSnap,
  ScenarioDef,
  SimEvent,
  Warning,
} from './types'
import { FUND_BALANCE_AMOUNT } from './types'
import { credit, debit, makeAccountViews, type AccountViews } from './accounts'
import { expandEvents, lastBoundedOccurrence } from './events'
import {
  applyPeeked,
  initLoanState,
  peekScheduled,
  recalcAfterPrepay,
  reanchorOnRateChange,
  type LoanState,
} from './loan'
import { effectiveAnnualRate, monthlyRate } from './rate'
import { calendarYearAt, fundAnnualContributionAt, fundTimeline } from './fund'
import { pensionMonthlyAtRetirement } from './pension'

/** 模拟期数硬上限（100 年），覆盖「退休后 30 年」的默认观察期。 */
export const MAX_HORIZON = 1200

/**
 * 统一模拟终点 H（总月数）：
 * max(全部贷款按原计划还清所需月数, 公积金处理时点+1,
 *     自动模式下退休后 30 年的年末, 自定义终点年偏移+12（含终点当年全年）,
 *     最晚事件发生月+1, 有界重复事件（count/untilMonth）末次发生月+1, 12)
 * —— 所有方案必须模拟到同一 H 才可比（坑 7/9）。
 * 无界重复与定投不延伸终点，随 H 截断。
 */
export function computeHorizonMonths(input: AnalysisInput): number {
  const { global } = input
  let h = 12
  for (const loan of input.loans) {
    h = Math.max(h, (loan.startDelayMonths ?? 0) + loan.remainingMonths)
  }
  // 公积金余额的处理时点：退休年（领退休金/可提取），未设则=停止缴存时
  if (input.fund) {
    h = Math.max(h, fundTimeline(global, input.fund).processAtM + 1)
  }
  if (global.endMode === 'auto' && global.retireYear) {
    // 默认把退休后的现金流、养老金与资产消耗再观察 30 年；含第 30 年全年。
    h = Math.max(h, (global.retireYear - global.startYear + 30) * 12 + 12)
  }
  if (global.endMode === 'custom' && global.customEndYear) {
    h = Math.max(h, (global.customEndYear - global.startYear) * 12 + 12)
  }
  const lastEventMonth = (ev: SimEvent): number =>
    ev.type === 'invest'
      ? Math.floor(ev.monthIndex / 12) * 12 + ev.monthOfYear
      : Math.max(ev.monthIndex, lastBoundedOccurrence(ev, global.startMonth) ?? ev.monthIndex)
  for (const ev of input.lifeEvents) {
    h = Math.max(h, lastEventMonth(ev) + 1)
  }
  for (const sc of input.scenarios) {
    for (const ev of sc.events) {
      h = Math.max(h, lastEventMonth(ev) + 1)
    }
  }
  return Math.min(Math.max(1, h), MAX_HORIZON)
}

interface LoanRuntime {
  state: LoanState
  loan: LoanInput
  /** 当前已套用的执行利率（用于检测利率变动触发重锚） */
  appliedRate: number
  /** 放款月序：m >= startAt 后才开始计息还贷 */
  startAt: number
}

export interface SimulationResult {
  snaps: MonthSnap[]
  warnings: Warning[]
}

/**
 * 单方案逐月模拟。stress=true 时理财收益 = 预期 − 最大亏损（压力测试情形）。
 *
 * 单月流水线（顺序不可变，同月事件确定性排序）：
 * ① 利率重定价 → ③ 收入入账 → ④ 支出扣活钱 → ⑤ 计划供款(公积金月冲优先)
 * → ⑥ 大额收入 → ⑦ 大额支出 → ⑧ 提前还款 → ⑨ 定投 → ⑩ 收益滚存
 * → ⑪ 公积金到期处理 → ⑫ 快照 → ⑬ 断裂检测
 */
export function simulateScenario(
  input: AnalysisInput,
  scenario: ScenarioDef,
  stress: boolean,
  horizon: number,
): SimulationResult {
  const { global } = input
  const warnings: Warning[] = []
  const snaps: MonthSnap[] = []

  // ---- 初始账户状态 ----
  const accts: AccountViews = makeAccountViews({
    initialCash: input.cash.initialBalance,
    poolBalances: Object.fromEntries(input.pools.map((p) => [p.id, p.initialBalance])),
    fundBalance: input.fund ? input.fund.initialBalance : null,
  })
  if (input.cash.sweepToPoolId) {
    const target = input.pools.find((p) => p.id === input.cash.sweepToPoolId)
    if (target) {
      credit('wealth', accts.cash, accts, target.id)
      accts.cash = 0
    }
  }

  const runtimes: LoanRuntime[] = input.loans.map((loan) => ({
    loan,
    state: initLoanState(loan),
    // 以合同利率为基准初始化：若第 0 年就有利率规则，首月第①步检测到差异即重锚，
    // 保证月供与利息始终按同一执行利率摊还
    appliedRate: loan.currentRate,
    startAt: Math.max(0, loan.startDelayMonths ?? 0),
  }))
  // 人生事件（公共）+ 本方案提前还款，统一展开排序（优先级：收入<支出<还款<定投）
  const expanded = expandEvents([...input.lifeEvents, ...scenario.events], horizon, global.startMonth)

  const poolById = new Map(input.pools.map((p) => [p.id, p]))
  let cumInterest = 0
  let cumPrincipal = 0
  let cumWealthReturn = 0
  let cumFundInterest = 0
  let prevBroken = false
  let prevOffsetShort = false
  let prevTopup = false
  let prevInvestShort = false

  /** 应急活钱底线：定投与现金类提前还款不得动用（生活/月供/大额支出不受限） */
  const reserve = Math.max(0, input.global.emergencyReserve ?? 0)
  const cashAvailableForPrepay = () => Math.max(accts.cash - reserve, 0)

  // 公积金时间线：缴存进行到「缴存年限结束」与「退休」中较早者；
  // 余额处理（到期政策）在「可提取时点」= 退休年 ?? 缴存结束
  const { contribUntilM: fundContribUntilM, processAtM: fundProcessAtM } =
    fundTimeline(global, input.fund)

  const activeLoans = (curM: number) =>
    runtimes.filter((r) => curM >= r.startAt && r.state.balance > 0)

  /**
   * 解析目标贷款。housingOnly=true（公积金来源）时：指定 id 的非房贷视为无效；
   * 自动模式只在房贷中选当前执行利率最高的（公积金不能碰车贷等其他贷款）。
   */
  function resolveTargetLoan(
    targetId: Id | undefined,
    housingOnly: boolean,
  ): LoanRuntime | null {
    if (targetId) {
      const found = runtimes.find((r) => r.loan.id === targetId) ?? null
      if (found && housingOnly && found.loan.kind === 'other') return null
      return found
    }
    const actives = activeLoans(m).filter((r) => !housingOnly || r.loan.kind !== 'other')
    if (actives.length === 0) return null
    return actives.reduce((best, r) =>
      effectiveAnnualRate(r.loan, m) > effectiveAnnualRate(best.loan, m) ? r : best,
    )
  }

  let m = 0
  while (m < horizon) {
    // ① 利率更新：与已套用利率不同则重锚（未放款的贷款跳过，放款首月自动重锚）
    for (const r of runtimes) {
      if (m < r.startAt) continue
      const rate = effectiveAnnualRate(r.loan, m)
      if (rate !== r.appliedRate) {
        reanchorOnRateChange(r.state, rate)
        r.appliedRate = rate
      }
    }

    // 日历映射
    const calAbs = global.startMonth - 1 + m
    const calYear = calendarYearAt(global, m)
    const calMonth = (calAbs % 12) + 1
    const yearIndex = Math.floor(m / 12)

    let monthlyOutgo = 0

    // ③ 收入入账
    const retired = global.retireYear !== undefined && calYear >= global.retireYear
    const incomeSeg = !retired && input.incomes.find((s) => calYear >= s.startYear && calYear <= s.endYear)
    if (incomeSeg) {
      accts.cash += incomeSeg.annualSalary / 12
      if (incomeSeg.annualBonus > 0 && calMonth === incomeSeg.bonusMonth) {
        accts.cash += incomeSeg.annualBonus
      }
    }
    // 退休年起工资停止，改为按选择的养老金模式向活钱按月入账。
    if (retired) accts.cash += pensionMonthlyAtRetirement(global, input.incomes)
    // 公积金缴存流入（退休后不再缴存）
    if (input.fund && m < fundContribUntilM) {
      credit('fund', fundAnnualContributionAt(input.fund, calYear) / 12, accts)
    }

    // ④ 支出计算（先记账，与月供一起在 ⑤b 统一从活钱支付并触发补足）
    const inflationFactor = global.inflationEnabled
      ? Math.pow(1 + global.inflationRate, yearIndex)
      : 1
    let livingAndFixed = 0
    for (const seg of input.living) {
      if (calYear >= seg.startYear && calYear <= seg.endYear) {
        livingAndFixed += (seg.annualAmount / 12) * inflationFactor
      }
    }
    for (const seg of input.fixedExpenses) {
      if (calYear >= seg.startYear && calYear <= seg.endYear) {
        livingAndFixed += seg.annualAmount / 12
      }
    }

    // ⑤ 计划供款：先看全月供 → 公积金月冲（仅房贷、受开关控制）→ 差额现金自付 → 再落账
    const useFundOffset = input.global.fundMonthlyOffset !== false // 缺省视为启用
    const scheduled = new Map<Id, ReturnType<typeof peekScheduled>>()
    let totalDue = 0
    let housingDue = 0
    for (const r of activeLoans(m)) {
      const s = peekScheduled(r.state, r.appliedRate)
      scheduled.set(r.loan.id, s)
      totalDue += s.payment
      if (r.loan.kind !== 'other') housingDue += s.payment
    }
    let fundOffset = 0
    if (housingDue > 0 && useFundOffset && accts.fundBalance !== null) {
      fundOffset = Math.min(accts.fundBalance, housingDue)
      accts.fundBalance -= fundOffset
    }
    // 月冲不足预警：公积金参与了但没盖住房贷月供——差额自动转现金自付（每段只报一次）
    const offsetShort =
      useFundOffset && accts.fundBalance !== null && housingDue > fundOffset
    if (offsetShort && !prevOffsetShort) {
      warnings.push({
        m,
        kind: 'offset-shortfall',
        amount: housingDue - fundOffset,
        detail: `公积金余额不足以全额覆盖房贷月供（本月缺口 ${(housingDue - fundOffset).toFixed(0)} 元），差额已自动改由活钱支付；后续各月同理，直到有新的缴存流入`,
      })
    }
    prevOffsetShort = offsetShort

    // ⑤b 刚性支出统一支付：生活+固定+月供合计超过活钱时，按用户策略从理财支取补足。
    // 每个连续缺口段只报一次预警；策略为 'cash-only' 时不补（活钱透支走断裂检测）。
    const selfPaid = totalDue - fundOffset
    const totalNeed = livingAndFixed + selfPaid
    const shortfallGap = totalNeed - Math.max(accts.cash, 0)
    let topupTaken = 0
    if (shortfallGap > 0) {
      const mode = input.global.monthlyTopUpSource ?? 'cash-only'
      if (mode === 'wealth-proportional') {
        const totalWealth = [...accts.pools.values()].reduce((a, b) => a + b, 0)
        if (totalWealth > 0) {
          topupTaken = Math.min(shortfallGap, totalWealth)
          for (const [pid, bal] of accts.pools) {
            accts.pools.set(pid, bal - topupTaken * (bal / totalWealth))
          }
          accts.cash += topupTaken
        }
      } else if (mode !== 'cash-only') {
        const bal = accts.pools.get(mode) ?? 0
        topupTaken = Math.min(shortfallGap, bal)
        if (topupTaken > 0) {
          accts.pools.set(mode, bal - topupTaken)
          accts.cash += topupTaken
        }
      }
    }
    accts.cash -= totalNeed
    monthlyOutgo += totalNeed
    if (shortfallGap > 0 && !prevTopup) {
      warnings.push({
        m,
        kind: 'monthly-topup',
        detail:
          `${stress ? '压力情形：' : ''}活钱不足以覆盖生活开销与月供（本月缺口 ${shortfallGap.toFixed(0)} 元），` +
          (topupTaken > 0
            ? `开始动用理财——按「月供缺口补足来源」从理财池支取 ${topupTaken.toFixed(0)} 元补上；后续会继续支取，直到理财耗尽`
            : '但策略为不补或理财池余额不足——活钱将透支并触发资金断裂'),
      })
    }
    prevTopup = shortfallGap > 0
    for (const r of runtimes) {
      const s = scheduled.get(r.loan.id)
      if (!s) continue
      applyPeeked(r.state, s)
      cumInterest += s.interest
      cumPrincipal += s.principalPart
    }

    // ⑥⑦⑧⑨ 本月事件（expandEvents 已按 收入<支出<还款<定投 排序）
    for (const ev of expanded.get(m) ?? []) {
      switch (ev.type) {
        case 'big-income': {
          credit(ev.target, ev.amount, accts, ev.wealthPoolId)
          break
        }
        case 'big-expense': {
          // 公积金不可提取只能还贷——大额支出禁止用公积金来源
          if (ev.source === 'fund') {
            warnings.push({
              m,
              kind: 'expense-shortfall',
              detail: `「${ev.label}」不能从公积金扣款（公积金仅限还贷），本月未执行`,
            })
            break
          }
          const executed = debit(ev.source, ev.amount, accts, ev.wealthPoolId)
          // 大额支出是一次性存量消耗，不计入 monthlyOutgo（跑道口径=经常性燃烧率），
          // 否则首付级别的支出会把当月覆盖月数打成 0，宽心指数失真
          if (executed < ev.amount) {
            warnings.push({
              m,
              kind: 'expense-shortfall',
              detail: `「${ev.label}」需 ${ev.amount.toFixed(0)} 元，实际仅执行 ${executed.toFixed(0)} 元`,
            })
          }
          break
        }
        case 'prepay': {
          executePrepay(
            ev.amount,
            ev.effect,
            ev.targetLoanId,
            ev.source,
            ev.wealthPoolId,
            m,
            ev.targetGroup === 'housing',
          )
          break
        }
        case 'invest': {
          // 自动降挡：只动用应急活钱底线之外的部分；不足则按实际金额投入。
          // 连续失败的各期合并为一个「降挡段」，只在段首报一次预警
          const moved = Math.min(ev.amount, cashAvailableForPrepay())
          accts.cash -= moved
          credit('wealth', moved, accts, ev.poolId)
          const failed = moved < ev.amount
          if (failed && !prevInvestShort) {
            warnings.push({
              m,
              kind: 'invest-shortfall',
              detail: `定投需 ${ev.amount.toFixed(0)} 元，扣除应急活钱（${reserve.toFixed(0)} 元）后仅能投入 ${moved.toFixed(0)} 元 → 自动降挡；本段内持续不足的各期均按实际金额投入`,
            })
          }
          prevInvestShort = failed
          break
        }
      }
    }

    // ⑩ 收益滚存（复利按月）
    for (const [poolId, balance] of accts.pools) {
      const pool = poolById.get(poolId)
      if (!pool) continue
      const r = stress
        ? pool.expectedAnnualReturn - pool.maxLossPct
        : pool.expectedAnnualReturn
      const gain = balance * (r / 12)
      cumWealthReturn += gain
      accts.pools.set(poolId, balance + gain)
    }
    if (accts.fundBalance !== null && input.fund) {
      const gain = accts.fundBalance * (input.fund.interestRate / 12)
      cumFundInterest += gain
      accts.fundBalance += gain
    }

    // ⑪ 公积金余额处理（在可提取时点触发，排在月冲之后避免双重扣款——坑 3）。
    // 到期时点即可提取时点：任何政策下资金都不得凭空消失或被幽灵账户吸收。
    if (
      input.fund &&
      m === fundProcessAtM &&
      accts.fundBalance !== null &&
      accts.fundBalance > 0
    ) {
      // 结余兜底去向：指定池 > 第一个池；目标池不存在则保留在公积金内继续计息
      const sweepTargetId =
        input.fund.withdrawToPoolId ?? [...poolById.keys()][0] ?? null
      switch (input.fund.maturityPolicy) {
        case 'hold':
          break
        case 'lumpPrepay': {
          // 对仍在还的房贷按利率从高到低逐笔冲抵（组合贷无需拆开配置）
          const housing = activeLoans(m)
            .filter((r) => r.loan.kind !== 'other')
            .sort((a, b) => effectiveAnnualRate(b.loan, m) - effectiveAnnualRate(a.loan, m))
          for (const r of housing) {
            if ((accts.fundBalance ?? 0) <= 0) break
            executePrepay(
              accts.fundBalance!,
              input.fund.maturityPrepayEffect,
              r.loan.id,
              'fund',
              undefined,
              m,
              true, // 公积金冲抵只作用于房贷
            )
          }
          // 冲抵后结余（无房贷可冲 / 房贷余额小于公积金）转入理财池
          const leftover = accts.fundBalance ?? 0
          if (leftover > 0 && sweepTargetId && poolById.has(sweepTargetId)) {
            credit('wealth', leftover, accts, sweepTargetId)
            accts.fundBalance = 0
          }
          break
        }
        case 'withdrawToWealth': {
          if (sweepTargetId && poolById.has(sweepTargetId)) {
            credit('wealth', accts.fundBalance, accts, sweepTargetId)
            accts.fundBalance = 0
          }
          break
        }
      }
    }

    // ⑫ 快照（未放款的贷款不计负债、不计月供）
    const poolsSnap: Record<string, number> = {}
    for (const [id, v] of accts.pools) poolsSnap[id] = v
    let loanSum = 0
    const loanSnaps: LoanSnap[] = runtimes.map((r) => {
      const started = m >= r.startAt
      if (!started) {
        return {
          loanId: r.loan.id,
          balance: 0,
          scheduledPayment: 0,
          monthsLeft: r.loan.remainingMonths,
          active: false,
          notStarted: true,
        }
      }
      loanSum += r.state.balance
      return {
        loanId: r.loan.id,
        balance: r.state.balance,
        scheduledPayment: peekScheduled(r.state, r.appliedRate).payment,
        monthsLeft: r.state.monthsLeft,
        active: r.state.balance > 0,
        notStarted: false,
      }
    })
    // 净资产（金融口径）= 活钱 + 理财池 + 公积金 − 贷款余额；房产不计入
    const netWorth = accts.cash + Object.values(poolsSnap).reduce((a, b) => a + b, 0) +
      (accts.fundBalance ?? 0) - loanSum

    snaps.push({
      m,
      loans: loanSnaps,
      cash: accts.cash,
      pools: poolsSnap,
      fundBalance: accts.fundBalance ?? 0,
      cumInterest,
      cumPrincipal,
      cumTotalPaid: cumInterest + cumPrincipal,
      cumWealthReturn,
      cumFundInterest,
      netWorth,
      brokeThisMonth: accts.cash < 0,
      monthlyOutgo,
    })

    // ⑬ 断裂检测：每个连续断裂段只记一条 warning；压力情形单独标 kind
    const broken = accts.cash < 0
    if (broken && !prevBroken) {
      warnings.push({
        m,
        kind: stress ? 'stress-broken' : 'broken',
        detail: `${stress ? '压力情形：' : ''}第 ${m} 月起现金透支（余额 ${accts.cash.toFixed(0)} 元），无法覆盖开销与月供`,
      })
    }
    prevBroken = broken
    m++
  }

  return { snaps, warnings }

  /** 提前还款执行（事件与公积金一次性冲抵共用）。多条按序执行，后者看到前者结果（坑 7） */
  function executePrepay(
    amount: number,
    effect: 'shorten-term' | 'reduce-payment',
    targetLoanId: Id | undefined,
    source: 'cash' | 'wealth' | 'fund',
    wealthPoolId: Id | undefined,
    atMonth: number,
    housingGroup = false,
  ): void {
    // 目标限定为房贷的三种情况：公积金来源 / 显式 targetGroup='housing' / 公积金到期冲抵
    const housingOnly = source === 'fund' || housingGroup
    const target = resolveTargetLoan(targetLoanId, housingOnly)
    if (!target) {
      if (housingOnly && amount > 0) {
        warnings.push({
          m: atMonth,
          kind: 'prepay-shortfall',
          detail: '公积金只能用于偿还房贷，无法用于车贷等其他贷款，本次还款未执行',
        })
      }
      return
    }

    // 处理特殊金额值：使用全部公积金余额
    let actualAmount = amount
    if (amount === FUND_BALANCE_AMOUNT && source === 'fund' && accts.fundBalance !== null) {
      actualAmount = Math.max(accts.fundBalance, 0)
    }

    if (actualAmount <= 0) return

    // 银行口径：还款额以当前剩余本金封顶，超出部分不扣（避免吞钱）
    const capped = Math.min(actualAmount, target.state.balance)

    // 资金来源
    let executed: number
    if (source === 'fund' && accts.fundBalance !== null) {
      executed = Math.min(capped, Math.max(accts.fundBalance, 0))
      accts.fundBalance -= executed
    } else if (source === 'wealth') {
      executed = debit('wealth', capped, accts, wealthPoolId)
    } else {
      // 现金来源：不动用应急活钱底线，不足自动降挡
      executed = Math.min(capped, cashAvailableForPrepay())
      accts.cash -= executed
    }
    if (executed < capped) {
      warnings.push({
        m: atMonth,
        kind: 'prepay-shortfall',
        detail: `提前还款需 ${capped.toFixed(0)} 元，来源仅够 ${executed.toFixed(0)} 元 → 自动降挡为部分执行；贷款余额与后续月供按已执行部分重算${
          source === 'cash' ? `（已保留应急活钱 ${reserve.toFixed(0)} 元）` : ''
        }`,
      })
    }
    if (executed <= 0) return

    // 违约金从同一来源额外扣收（不冲本金）
    if (target.loan.prepayPenaltyRate) {
      debit(source, executed * target.loan.prepayPenaltyRate, accts, wealthPoolId)
    }

    const balanceAfter = target.state.balance - executed
    if (balanceAfter <= 0) {
      target.state.balance = 0
      target.state.monthsLeft = 0
      return
    }
    const i = monthlyRate(effectiveAnnualRate(target.loan, atMonth))
    const recalc = recalcAfterPrepay(
      target.state.method,
      effect,
      balanceAfter,
      i,
      target.state.paymentAnchor,
      target.state.monthsLeft,
    )
    target.state.balance = balanceAfter
    target.state.paymentAnchor = recalc.newAnchor
    target.state.monthsLeft = recalc.newMonthsLeft
  }
}

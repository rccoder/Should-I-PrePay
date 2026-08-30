import { describe, expect, it } from 'vitest'
import { computeHorizonMonths, simulateScenario } from '../simulate'
import { runAnalysis } from '../index'
import { annuityPayment } from '../loan'
import type {
  AnalysisInput,
  PrepayEvent,
  ScenarioDef,
} from '../types'

/** 标准画像：12 万商贷 / 24 期 / 12%，月薪 2 万 / 生活支出 2 千/月 */
function makeInput(overrides: Partial<AnalysisInput> = {}, scenarioEvents: PrepayEvent[][] = [[]]): AnalysisInput {
  const scenarios: ScenarioDef[] = scenarioEvents.map((events, i) => ({
    id: `sc-${i}`,
    name: i === 0 ? '基准' : `方案${i}`,
    colorSlot: ((i % 4) + 1) as 1 | 2 | 3 | 4,
    isBaseline: i === 0,
    events,
  }))
  return {
    global: {
      startYear: 2026,
      startMonth: 1,
      endMode: 'auto',
      inflationEnabled: false,
      inflationRate: 0.025,
      fundMonthlyOffset: true,
      emergencyReserve: 0,
      monthlyTopUpSource: 'cash-only',
    },
    loans: [
      {
        id: 'loan-c',
        name: '商业贷款',
        kind: 'commercial',
        principal: 120_000,
        remainingMonths: 24,
        currentRate: 0.12,
        method: 'annuity',
        rateRules: [],
      },
    ],
    incomes: [
      { id: 'inc-1', startYear: 2026, endYear: 2030, annualSalary: 240_000, annualBonus: 0, bonusMonth: 1 },
    ],
    fixedExpenses: [],
    living: [{ id: 'liv-1', startYear: 2026, endYear: 2035, annualAmount: 24_000 }],
    lifeEvents: [],
    cash: { initialBalance: 0 },
    pools: [{ id: 'p-hi', name: '高风险', riskLevel: 'high', initialBalance: 0, expectedAnnualReturn: 0, maxLossPct: 0.1 }],
    fund: null,
    scenarios,
    ...overrides,
  }
}

describe('资金路由顺序', () => {
  it('公积金月冲优先于现金自付：月供全额由公积金覆盖时现金不动', () => {
    const input = makeInput({
      fund: {
        initialBalance: 50_000,
        annualContribution: 0,
        contributionYears: 0,
        interestRate: 0,
        maturityPolicy: 'hold',
        maturityPrepayEffect: 'shorten-term',
      },
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    // 月供 M = annuityPayment(120000, 0.01, 24) ≈ 5652.49
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    // m=0: 现金 = 工资 20000 − 生活 2000 − 自付 0 = 18000；公积金 = 50000 − M
    expect(snaps[0]!.cash).toBeCloseTo(18_000, 6)
    expect(snaps[0]!.fundBalance).toBeCloseTo(50_000 - M, 4)
    expect(snaps[0]!.cumInterest).toBeCloseTo(1200, 6)
  })

  it('公积金余额不足时差额从现金扣', () => {
    const input = makeInput({
      fund: {
        initialBalance: 1_000,
        annualContribution: 0,
        contributionYears: 0,
        interestRate: 0,
        maturityPolicy: 'hold',
        maturityPrepayEffect: 'shorten-term',
      },
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    // 自付 = M − 1000
    expect(snaps[0]!.cash).toBeCloseTo(20_000 - 2_000 - (M - 1_000), 4)
    expect(snaps[0]!.fundBalance).toBeCloseTo(0, 8)
  })

  it('先收入后支出：同月工资先到账再扣开销', () => {
    const input = makeInput({
      loans: [],
      incomes: [{ id: 'i', startYear: 2026, endYear: 2030, annualSalary: 12_000, annualBonus: 0, bonusMonth: 1 }],
      living: [{ id: 'l', startYear: 2026, endYear: 2030, annualAmount: 12_000 }],
      cash: { initialBalance: 0 },
      scenarios: [{ id: 'sc-0', name: '基准', colorSlot: 1, isBaseline: true, events: [] }],
    })
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 12)
    expect(snaps[0]!.cash).toBeCloseTo(0, 8)
    expect(warnings.filter((w) => w.kind === 'broken')).toHaveLength(0)
  })
})

describe('断裂检测', () => {
  it('现金透支标记断裂，连续断裂只记一条 warning', () => {
    const input = makeInput({
      loans: [],
      incomes: [],
      living: [{ id: 'l', startYear: 2026, endYear: 2035, annualAmount: 24_000 }],
      cash: { initialBalance: 3_000 },
    })
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 24)
    // 第 0 月末还剩 3000−2000=1000 元缓冲；第 1 月起透支
    expect(snaps[0]!.brokeThisMonth).toBe(false)
    expect(snaps[0]!.cash).toBeCloseTo(1_000, 8)
    expect(snaps[1]!.brokeThisMonth).toBe(true)
    const broken = warnings.filter((w) => w.kind === 'broken')
    expect(broken).toHaveLength(1)
    expect(broken[0]!.m).toBe(1)
  })

  it('压力情形断裂标记为 stress-broken', () => {
    const input = makeInput({
      loans: [],
      incomes: [],
      living: [{ id: 'l', startYear: 2026, endYear: 2035, annualAmount: 24_000 }],
      cash: { initialBalance: 0 },
      pools: [{ id: 'p', name: '池', riskLevel: 'high', initialBalance: 1_000, expectedAnnualReturn: 0.05, maxLossPct: 0.5 }],
    })
    const { warnings } = simulateScenario(input, input.scenarios[0]!, true, 24)
    // 池收益 −45%/年 也撑不了几个月支出
    expect(warnings.some((w) => w.kind === 'stress-broken')).toBe(true)
  })
})

describe('公积金到期三政策', () => {
  const fundBase = {
    initialBalance: 0,
    annualContribution: 60_000,
    contributionYears: 1,
    interestRate: 0,
    maturityPrepayEffect: 'reduce-payment' as const,
  }

  function policyInput(policy: 'hold' | 'lumpPrepay' | 'withdrawToWealth'): AnalysisInput {
    // 小额长周期贷款：月供远小于月缴存，公积金才能积累；且到期时贷款仍在还，
    // lumpPrepay 才有冲抵对象
    return makeInput(
      {
        fund: { ...fundBase, maturityPolicy: policy, withdrawToPoolId: 'p-hi' },
        loans: [
          {
            id: 'loan-c', name: '商贷', kind: 'commercial', principal: 12_000,
            remainingMonths: 60, currentRate: 0.12, method: 'annuity', rateRules: [],
          },
        ],
      },
    )
  }
  function run(policy: 'hold' | 'lumpPrepay' | 'withdrawToWealth') {
    const input = policyInput(policy)
    const horizon = computeHorizonMonths(input)
    expect(horizon).toBeGreaterThanOrEqual(13) // 到期月必须在模拟范围内
    return simulateScenario(input, input.scenarios[0]!, false, horizon)
  }

  it('hold：余额保留，之后继续以月冲方式抵扣月供', () => {
    const { snaps } = run('hold')
    const last = snaps[snaps.length - 1]!
    // 缴存 60000 扣除两年多的月冲抵扣后仍有大量结余
    expect(last.fundBalance).toBeGreaterThan(35_000)
  })

  it('lumpPrepay：到期余额一次性冲抵贷款——当月贷款归零、总利息更少', () => {
    const hold = run('hold')
    const lump = run('lumpPrepay')
    // 到期月（m=12）快照：lump 的贷款已被一次性冲抵归零，hold 还剩正常摊还中的余额
    const holdSnap12 = hold.snaps[12]!
    const lumpSnap12 = lump.snaps[12]!
    expect(lumpSnap12.loans.find((l) => l.loanId === 'loan-c')!.balance).toBe(0)
    expect(holdSnap12.loans.find((l) => l.loanId === 'loan-c')!.balance).toBeGreaterThan(8_000)
    // 利息分化从次月开始（冲抵发生在当月供款之后）：只对比终点
    const holdLast = hold.snaps[hold.snaps.length - 1]!
    const lumpLast = lump.snaps[lump.snaps.length - 1]!
    expect(lumpLast.cumInterest).toBeLessThan(holdLast.cumInterest)
  })

  it('withdrawToWealth：到期余额转入指定理财池', () => {
    const hold = run('hold')
    const withdraw = run('withdrawToWealth')
    const holdLast = hold.snaps[hold.snaps.length - 1]!
    const wLast = withdraw.snaps[withdraw.snaps.length - 1]!
    expect(wLast.fundBalance).toBe(0)
    expect(wLast.pools['p-hi']!).toBeGreaterThan(holdLast.pools['p-hi']!)
  })
})

describe('公积金缴存时间线', () => {
  it('按年度区间逐月缴存，未覆盖年份不再入账', () => {
    const input = makeInput({
      loans: [], incomes: [], living: [], cash: { initialBalance: 0 },
      fund: {
        initialBalance: 0,
        contributionSegments: [
          { id: 'f-1', startYear: 2026, endYear: 2026, annualAmount: 12_000 },
          { id: 'f-2', startYear: 2028, endYear: 2028, annualAmount: 24_000 },
        ],
        interestRate: 0,
        maturityPolicy: 'hold',
        maturityPrepayEffect: 'shorten-term',
      },
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 36)
    expect(snaps[11]!.fundBalance).toBeCloseTo(12_000, 8)
    expect(snaps[23]!.fundBalance).toBeCloseTo(12_000, 8)
    expect(snaps[35]!.fundBalance).toBeCloseTo(36_000, 8)
  })
})

describe('事件执行', () => {
  it('同月先大额收入后提前还款：还款能看到当月到账的钱', () => {
    // 大额收入是公共人生事件；提前还款属于方案
    const input = makeInput(
      {
        lifeEvents: [
          { id: 'g', type: 'big-income', monthIndex: 5, label: '卖房', amount: 60_000, target: 'cash' },
        ],
      },
      [[], [
        { id: 'p', type: 'prepay', monthIndex: 5, amount: 50_000, effect: 'shorten-term', source: 'cash' },
      ]],
    )
    const { snaps, warnings } = simulateScenario(input, input.scenarios[1]!, false, 24)
    expect(warnings.filter((w) => w.kind === 'prepay-shortfall')).toHaveLength(0)
    // m=5 快照在事件之后：贷款余额应已减少 5 万
    const snap5 = snaps[5]!
    expect(snap5.loans[0]!.balance).toBeLessThan(
      simulateScenario(input, input.scenarios[0]!, false, 24).snaps[5]!.loans[0]!.balance - 49_999,
    )
  })

  it('资金不足时部分执行并记 prepay-shortfall', () => {
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 50_000, effect: 'shorten-term', source: 'cash' },
    ]
    // 无收入无支出：事件时可动用现金恰好 = 初始 10000 − 自付月供 M
    const input = makeInput(
      { cash: { initialBalance: 10_000 }, incomes: [], living: [] },
      [[], events],
    )
    const { snaps, warnings } = simulateScenario(input, input.scenarios[1]!, false, 24)
    expect(warnings.some((w) => w.kind === 'prepay-shortfall')).toBe(true)
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    const principalPart = M - 1_200
    const executedPrepay = Math.max(0, 10_000 - M)
    expect(snaps[0]!.loans[0]!.balance).toBeCloseTo(
      120_000 - principalPart - executedPrepay,
      2,
    )
  })

  it('大额支出不能用公积金（公积金仅限还贷）', () => {
    const input = makeInput({
      fund: { initialBalance: 50_000, annualContribution: 0, contributionYears: 0, interestRate: 0, maturityPolicy: 'hold', maturityPrepayEffect: 'shorten-term' },
      lifeEvents: [
        { id: 'x', type: 'big-expense', monthIndex: 0, label: '买车', amount: 30_000, source: 'fund' },
      ],
    })
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 24)
    expect(warnings.some((w) => w.kind === 'expense-shortfall')).toBe(true)
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    // 本月月冲照常从公积金扣款，大额支出未动公积金
    expect(snaps[0]!.fundBalance).toBeCloseTo(50_000 - M, 2)
  })

  it('定投不足时部分投入并记 invest-shortfall', () => {
    // 当月可投入结余 = 20000 − 2000 − M ≈ 12351，定投 3 万必然不足
    const input = makeInput(
      {
        lifeEvents: [
          { id: 'v', type: 'invest', monthIndex: 0, monthOfYear: 1, amount: 30_000, poolId: 'p-hi' },
        ],
      },
    )
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 24)
    expect(warnings.some((w) => w.kind === 'invest-shortfall')).toBe(true)
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    expect(snaps[0]!.pools['p-hi']!).toBeCloseTo(20_000 - 2_000 - M, 2)
  })
})

describe('通胀递增锚定模拟起点年（坑 6）', () => {
  it('第 2 年生活支出 = 第 1 年 × (1+g)^1', () => {
    const input = makeInput(
      {
        loans: [],
        incomes: [],
        living: [{ id: 'l', startYear: 2026, endYear: 2036, annualAmount: 24_000 }],
        cash: { initialBalance: 1_000_000 },
        global: {
          startYear: 2026, startMonth: 1, endMode: 'auto',
          inflationEnabled: true, inflationRate: 1.0,
          fundMonthlyOffset: true,
          emergencyReserve: 0,
          monthlyTopUpSource: 'cash-only',
        },
      },
    )
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 30)
    expect(snaps[0]!.monthlyOutgo).toBeCloseTo(2_000, 6)
    expect(snaps[12]!.monthlyOutgo).toBeCloseTo(4_000, 6)
    expect(snaps[24]!.monthlyOutgo).toBeCloseTo(8_000, 6)
  })
})

describe('初始活钱转入理财池', () => {
  it('sweepToPoolId：初始现金全部进入目标池', () => {
    const input = makeInput({
      loans: [],
      incomes: [],
      living: [],
      cash: { initialBalance: 50_000, sweepToPoolId: 'p-hi' },
      pools: [{ id: 'p-hi', name: '低风险', riskLevel: 'low', initialBalance: 0, expectedAnnualReturn: 0.024, maxLossPct: 0.01 }],
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 12)
    expect(snaps[0]!.cash).toBe(0)
    expect(snaps[0]!.pools['p-hi']!).toBeCloseTo(50_000 * (1 + 0.024 / 12), 4)
  })
})

describe('月冲开关与公积金适用范围', () => {
  const M24 = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
  // 车贷：1.2 万 / 24 期 / 年利率 10%（月利率 0.1/12）
  const CAR_M = 12_000 * (0.1 / 12) * Math.pow(1 + 0.1 / 12, 24) /
    (Math.pow(1 + 0.1 / 12, 24) - 1)

  function twoLoanInput(globalPatch: Partial<AnalysisInput['global']> = {}): AnalysisInput {
    return makeInput({
      global: {
        startYear: 2026, startMonth: 1, endMode: 'auto',
        inflationEnabled: false, inflationRate: 0.025,
        fundMonthlyOffset: true,
        emergencyReserve: 0,
        monthlyTopUpSource: 'cash-only',
        ...globalPatch,
      },
      loans: [
        { id: 'loan-h1', name: '商贷', kind: 'commercial', principal: 120_000, remainingMonths: 24, currentRate: 0.12, method: 'annuity', rateRules: [] },
        { id: 'loan-car', name: '车贷', kind: 'other', principal: 12_000, remainingMonths: 24, currentRate: 0.10, method: 'annuity', rateRules: [] },
      ],
      fund: {
        initialBalance: 5_000,
        annualContribution: 0,
        contributionYears: 0,
        interestRate: 0,
        maturityPolicy: 'hold',
        maturityPrepayEffect: 'shorten-term',
      },
    })
  }

  it('公积金月冲只作用于房贷：车贷月供始终由现金支付', () => {
    const input = twoLoanInput()
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    // m=0：公积金先抵房贷（5000 < M24，全被用掉），差额+车贷走现金
    expect(snaps[0]!.fundBalance).toBeCloseTo(0, 6)
    expect(snaps[0]!.cash).toBeCloseTo(20_000 - 2_000 - (M24 + CAR_M - 5_000), 2)
  })

  it('关闭月冲后：月供全部走现金，公积金原封不动计息', () => {
    const input = twoLoanInput({ fundMonthlyOffset: false })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 3)
    expect(snaps[0]!.fundBalance).toBeCloseTo(5_000, 4)
    // 现金支付两笔贷款的月供
    expect(snaps[0]!.cash).toBeCloseTo(20_000 - 2_000 - M24 - CAR_M, 2)
  })

  it('公积金来源的提前还款不能指定车贷：跳过并警告', () => {
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 3_000, effect: 'shorten-term', source: 'fund', targetLoanId: 'loan-car' },
    ]
    const input = makeInput(
      {
        fund: {
          initialBalance: 50_000,
          annualContribution: 0,
          contributionYears: 0,
          interestRate: 0,
          maturityPolicy: 'hold',
          maturityPrepayEffect: 'shorten-term',
        },
      },
      [[], events],
    )
    const { snaps, warnings } = simulateScenario(input, input.scenarios[1]!, false, 24)
    expect(warnings.some((w) => w.detail.includes('公积金只能用于偿还房贷'))).toBe(true)
    // 车贷余额未被动过（本夹具无车贷，检查主贷款正常）
    expect(snaps[0]!.loans[0]!.balance).toBeGreaterThan(100_000)
  })

  it('现金来源+自动目标：在全部贷款（含车贷）中选利率最高的一笔', () => {
    // 车贷利率调到 15% 高于商贷 12% → 现金提前还款应优先冲车贷
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 3_000, effect: 'shorten-term', source: 'cash' },
    ]
    const base = twoLoanInput({ fundMonthlyOffset: false })
    const input: AnalysisInput = {
      ...base,
      loans: base.loans.map((l) =>
        l.id === 'loan-car' ? { ...l, currentRate: 0.15 } : l,
      ),
      cash: { initialBalance: 10_000 },
      incomes: [],
      living: [],
      fund: null,
      scenarios: [
        { id: 'sc-0', name: '基准', colorSlot: 1, isBaseline: true, events: [] },
        { id: 'sc-1', name: '还高息', colorSlot: 2, isBaseline: false, events },
      ],
    }
    const { snaps } = simulateScenario(input, input.scenarios[1]!, false, 24)
    // 车贷首期计划本金 = 月供 − 当月利息
    const carI = 0.15 / 12
    const carM = 12_000 * carI * Math.pow(1 + carI, 24) / (Math.pow(1 + carI, 24) - 1)
    const carSchedPrincipal = carM - 12_000 * carI
    // 现金 10000 付完两笔月供后剩余约 3769，但提前还款额为 3000 → 全部冲进车贷
    const carSnap = snaps[0]!.loans.find((l) => l.loanId === 'loan-car')!
    expect(12_000 - carSnap.balance).toBeCloseTo(carSchedPrincipal + 3_000, 2)
    // 商贷只走了正常月供，未被波及
    expect(snaps[0]!.loans.find((l) => l.loanId === 'loan-h1')!.balance).toBeCloseTo(
      120_000 - (M24 - 1_200),
      0,
    )
  })

  it('公积金来源+自动目标：只在房贷中选利率最高的一笔', () => {
    // 关闭月冲、给足公积金，隔离验证「自动目标只选房贷」本身
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 30_000, effect: 'shorten-term', source: 'fund' },
    ]
    const base = twoLoanInput({ fundMonthlyOffset: false })
    const input: AnalysisInput = {
      ...base,
      fund: { ...base.fund!, initialBalance: 50_000 },
      scenarios: [
        { id: 'sc-0', name: '基准', colorSlot: 1, isBaseline: true, events: [] },
        { id: 'sc-1', name: '还房贷', colorSlot: 2, isBaseline: false, events },
      ],
    }
    const { snaps, warnings } = simulateScenario(input, input.scenarios[1]!, false, 24)
    expect(warnings.some((w) => w.kind === 'prepay-shortfall')).toBe(false)
    // 商贷利率 12% > 车贷 10%，且公积金只能还房贷 → 冲的是商贷（若错冲车贷则商贷仍为 ~11.5 万）
    expect(snaps[0]!.loans.find((l) => l.loanId === 'loan-h1')!.balance).toBeLessThan(95_000)
  })
})

describe('放款延迟（后置贷款）', () => {
  function delayedCarInput(): AnalysisInput {
    return makeInput({
      loans: [
        { id: 'loan-h', name: '房贷', kind: 'commercial', principal: 120_000, remainingMonths: 36, currentRate: 0.12, method: 'annuity', rateRules: [] },
        { id: 'loan-car', name: '车贷', kind: 'other', principal: 24_000, remainingMonths: 12, currentRate: 0.10, method: 'annuity', rateRules: [], startDelayMonths: 12 },
      ],
      cash: { initialBalance: 500_000 },
    })
  }

  it('未放款前：不计月供、不计入负债与净资产', () => {
    const input = delayedCarInput()
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    const s0 = snaps[0]!
    const carSnap0 = s0.loans.find((l) => l.loanId === 'loan-car')!
    expect(carSnap0.notStarted).toBe(true)
    expect(carSnap0.balance).toBe(0)
    expect(carSnap0.scheduledPayment).toBe(0)
    // m=0 的净资产不含车贷
    const expectedNw0 =
      s0.cash + Object.values(s0.pools).reduce((a, b) => a + b, 0) + s0.fundBalance -
      (s0.loans.find((l) => l.loanId === 'loan-h')!.balance)
    expect(s0.netWorth).toBeCloseTo(expectedNw0, 6)
    // m=12 起车贷开始还
    const carSnap12 = snaps[12]!.loans.find((l) => l.loanId === 'loan-car')!
    expect(carSnap12.notStarted).toBe(false)
    expect(carSnap12.balance).toBeLessThan(24_000)
    expect(snaps[11]!.loans.find((l) => l.loanId === 'loan-car')!.notStarted).toBe(true)
  })

  it('终点覆盖延迟贷款的还清时间；还清月从放款后起算', () => {
    const input = delayedCarInput()
    const horizon = computeHorizonMonths(input)
    expect(horizon).toBeGreaterThanOrEqual(24) // 12 + 12
    const result = runAnalysis(input)
    const payoff = result.outcomes['sc-0']!.metrics.payoffMonthByLoan['loan-car']!
    expect(payoff).toBeGreaterThanOrEqual(12)
    expect(payoff).toBeLessThanOrEqual(horizon)
  })
})

describe('宽心指数与跑道口径', () => {
  it('一次性大额支出（如首付）不压垮宽心指数', () => {
    const input = makeInput({
      loans: [],
      incomes: [
        { id: 'i', startYear: 2026, endYear: 2050, annualSalary: 240_000, annualBonus: 0, bonusMonth: 12 },
      ],
      living: [{ id: 'l', startYear: 2026, endYear: 2075, annualAmount: 120_000 }],
      cash: { initialBalance: 1_400_000 },
      lifeEvents: [
        { id: 'sf', type: 'big-expense', monthIndex: 0, label: '买房首付', amount: 1_000_000, source: 'cash' },
      ],
    })
    const result = runAnalysis(input)
    const score = result.outcomes['sc-0']!.score
    // 付完首付手里还有 40w，月开销 1w → 跑道 ~40 个月，应是高分而非被当月 100w 流出打成危险
    expect(score.score).toBeGreaterThanOrEqual(70)
    expect(score.currentCoverage).toBeGreaterThan(30)
  })
})

describe('机会成本口径端到端（runAnalysis）', () => {
  it('资金路径拆解可与真实节省严格对账', () => {
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 60_000, effect: 'shorten-term', source: 'wealth', wealthPoolId: 'p-hi' },
    ]
    const input = makeInput(
      {
        cash: { initialBalance: 0 },
        pools: [{ id: 'p-hi', name: '池', riskLevel: 'high', initialBalance: 130_000, expectedAnnualReturn: 0.08, maxLossPct: 0.1 }],
      },
      [[], events],
    )
    const metrics = runAnalysis(input).outcomes['sc-1']!.metrics
    expect(metrics.realSavingVsBaseline).toBeCloseTo(
      metrics.nominalInterestSaving +
      metrics.fundInterestDeltaVsBaseline +
      metrics.wealthReturnDeltaVsBaseline +
      metrics.otherAssetPathDelta,
      6,
    )
  })

  it('应急活钱底线：定投只动用底线之外的部分，且预警说明降挡', () => {
    const input = makeInput(
      {
        loans: [],
        incomes: [],
        living: [],
        cash: { initialBalance: 150_000 },
        pools: [{ id: 'p-hi', name: '高风险', riskLevel: 'high', initialBalance: 0, expectedAnnualReturn: 0, maxLossPct: 0 }],
        global: {
          startYear: 2026, startMonth: 1, endMode: 'auto',
          inflationEnabled: false, inflationRate: 0.025,
          fundMonthlyOffset: true,
          emergencyReserve: 100_000,
          monthlyTopUpSource: 'wealth-proportional',
        },
        lifeEvents: [
          { id: 'v', type: 'invest', monthIndex: 0, monthOfYear: 1, amount: 80_000, poolId: 'p-hi' },
        ],
      },
    )
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 12)
    expect(snaps[0]!.pools['p-hi']!).toBeCloseTo(50_000, 6)
    expect(snaps[0]!.cash).toBeCloseTo(100_000, 6)
    const w = warnings.find((x) => x.kind === 'invest-shortfall')
    expect(w).toBeTruthy()
    expect(w!.detail).toContain('降挡')
  })

  it('公积金月冲不足：差额转现金自付并给一次性预警', () => {
    const input = makeInput({
      fund: {
        initialBalance: 2_000,
        annualContribution: 0,
        contributionYears: 0,
        interestRate: 0,
        maturityPolicy: 'hold',
        maturityPrepayEffect: 'shorten-term',
      },
    })
    const { snaps, warnings } = simulateScenario(input, input.scenarios[0]!, false, 8)
    const M = 120000 * 0.01 * Math.pow(1.01, 24) / (Math.pow(1.01, 24) - 1)
    // m=0：公积金抵 2000，差额现金付
    expect(snaps[0]!.fundBalance).toBeCloseTo(0, 6)
    expect(snaps[0]!.cash).toBeCloseTo(20_000 - 2_000 - (M - 2_000), 4)
    // 连续不足只报一次
    expect(warnings.filter((w) => w.kind === 'offset-shortfall')).toHaveLength(1)
    expect(warnings.find((w) => w.kind === 'offset-shortfall')!.amount).toBeCloseTo(M - 2_000, 4)
  })

  it('0% 理财收益 + 12% 高息贷款：立即还清的真实节省≈省下的利息', () => {
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 200_000, effect: 'shorten-term', source: 'cash' },
    ]
    const input = makeInput({ cash: { initialBalance: 130_000 } }, [[], events])
    const result = runAnalysis(input)
    const baseline = result.outcomes['sc-0']!
    const prepay = result.outcomes['sc-1']!
    expect(prepay.metrics.realSavingVsBaseline).toBeGreaterThan(5_000)
    // 0% 收益下机会成本为零，两口径应几乎一致
    expect(
      Math.abs(prepay.metrics.realSavingVsBaseline - prepay.metrics.nominalInterestSaving),
    ).toBeLessThan(1)
    expect(baseline.metrics.realSavingVsBaseline).toBe(0)
    expect(prepay.metrics.payoffMonthByLoan['loan-c']!).toBeLessThan(
      baseline.metrics.payoffMonthByLoan['loan-c']!,
    )
  })

  it('理财收益极高时不还款更划算：真实节省为负', () => {
    const events: PrepayEvent[] = [
      { id: 'p', type: 'prepay', monthIndex: 0, amount: 60_000, effect: 'shorten-term', source: 'wealth', wealthPoolId: 'p-hi' },
    ]
    const input = makeInput(
      {
        cash: { initialBalance: 0 },
        pools: [{ id: 'p-hi', name: '神池', riskLevel: 'high', initialBalance: 130_000, expectedAnnualReturn: 0.36, maxLossPct: 0.1 }],
      },
      [[], events],
    )
    const result = runAnalysis(input)
    const prepay = result.outcomes['sc-1']!
    expect(prepay.metrics.realSavingVsBaseline).toBeLessThan(0)
  })

  it('压力情形收益=预期−最大亏损：池余额按更低收益率滚存', () => {
    const input = makeInput({
      loans: [],
      incomes: [],
      living: [],
      cash: { initialBalance: 0 },
      pools: [{ id: 'p', name: '池', riskLevel: 'low', initialBalance: 100_000, expectedAnnualReturn: 0.06, maxLossPct: 0.08 }],
    })
    const base = simulateScenario(input, input.scenarios[0]!, false, 12)
    const stress = simulateScenario(input, input.scenarios[0]!, true, 12)
    expect(base.snaps[11]!.pools['p']!).toBeCloseTo(100_000 * Math.pow(1.005, 12), 2)
    expect(stress.snaps[11]!.pools['p']!).toBeCloseTo(100_000 * Math.pow(1 - 0.02 / 12, 12), 2)
  })
})

// ---------------------------------------------------------------------------
// 回归：公积金到期处理绝不销毁资金（冲抵只扣贷款余额，结余可提取进理财池）
// ---------------------------------------------------------------------------

describe('回归：公积金一次性冲抵不销毁资金', () => {
  const i4 = 0.04 / 12

  /** m=12 计划供款后的贷款余额（闭式解） */
  function balanceAfterMonths(principal: number, i: number, n: number): number {
    const M = annuityPayment(principal, i, n)
    const b = principal * Math.pow(1 + i, 12) - M * ((Math.pow(1 + i, 12) - 1) / i)
    return b - (M - b * i)
  }

  function fundFixture(
    policy: 'hold' | 'lumpPrepay' | 'withdrawToWealth',
    overrides: Partial<AnalysisInput> = {},
  ): AnalysisInput {
    return makeInput({
      global: {
        startYear: 2026, startMonth: 1, endMode: 'auto',
        inflationEnabled: false, inflationRate: 0.025,
        fundMonthlyOffset: false,
        emergencyReserve: 0,
        monthlyTopUpSource: 'cash-only',
      },
      loans: [
        {
          id: 'loan-c', name: '商贷', kind: 'commercial', principal: 30_000,
          remainingMonths: 60, currentRate: 0.04, method: 'annuity', rateRules: [],
        },
      ],
      cash: { initialBalance: 500_000 },
      pools: [{ id: 'p', name: '理财', riskLevel: 'low', initialBalance: 0, expectedAnnualReturn: 0, maxLossPct: 0 }],
      fund: {
        initialBalance: 200_000,
        annualContribution: 0,
        contributionYears: 1, // processAtM = 12
        interestRate: 0,
        maturityPolicy: policy,
        maturityPrepayEffect: 'shorten-term',
      },
      ...overrides,
    })
  }

  it('冲抵后结余转入理财池：与 hold 政策在冲抵月净资产完全一致', () => {
    const holdIn = fundFixture('hold')
    const lumpIn = fundFixture('lumpPrepay')
    const hold = simulateScenario(holdIn, holdIn.scenarios[0]!, false, 24)
    const lump = simulateScenario(lumpIn, lumpIn.scenarios[0]!, false, 24)
    const l11 = lump.snaps[11]!
    const l12 = lump.snaps[12]!

    // 手工对账：冲抵额 = m=12 供款后余额，剩余 20 万 − 冲抵额 进池
    const b13 = balanceAfterMonths(30_000, i4, 60)
    expect(l11.fundBalance).toBeCloseTo(200_000, 6)
    expect(l12.fundBalance).toBe(0)
    expect(l12.loans[0]!.balance).toBe(0)
    expect(Object.values(l12.pools).reduce((a, b) => a + b, 0)).toBeCloseTo(200_000 - b13, 2)
    // 资产守恒：同样的钱只是换了账户
    expect(l12.netWorth - hold.snaps[12]!.netWorth).toBeCloseTo(0, 6)
  })

  it('组合贷按利率从高到低逐笔冲抵（而非数组顺序），仍不足部分再进池', () => {
    const iC = 0.12 / 12
    const iF = 0.03 / 12
    // 数组顺序故意低利率在前：验证按利率排序而非数组序
    const input = fundFixture('lumpPrepay', {
      loans: [
        {
          id: 'lf', name: '公积金贷', kind: 'fund', principal: 15_000,
          remainingMonths: 120, currentRate: 0.03, method: 'annuity', rateRules: [],
        },
        {
          id: 'lc', name: '商贷', kind: 'commercial', principal: 20_000,
          remainingMonths: 60, currentRate: 0.12, method: 'annuity', rateRules: [],
        },
      ],
      fund: {
        initialBalance: 25_000,
        annualContribution: 0,
        contributionYears: 1,
        interestRate: 0,
        maturityPolicy: 'lumpPrepay',
        maturityPrepayEffect: 'shorten-term',
      },
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    const s12 = snaps[12]!
    const bc = balanceAfterMonths(20_000, iC, 60)
    const bf = balanceAfterMonths(15_000, iF, 120)
    const remainingAfterFirst = 25_000 - bc
    expect(s12.fundBalance).toBe(0)
    // 高利率商贷被全额冲抵
    expect(s12.loans.find((l) => l.loanId === 'lc')!.balance).toBe(0)
    // 公积金贷只被冲掉剩余额
    expect(s12.loans.find((l) => l.loanId === 'lf')!.balance).toBeCloseTo(bf - remainingAfterFirst, 2)
    expect(Object.values(s12.pools).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6)
  })

  it('无房贷在还时全额转入理财池而非滞留或消失', () => {
    const input = fundFixture('lumpPrepay', {
      loans: [
        {
          id: 'car', name: '车贷', kind: 'other', principal: 12_000,
          remainingMonths: 36, currentRate: 0.10, method: 'annuity', rateRules: [],
        },
      ],
    })
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, 24)
    const s12 = snaps[12]!
    expect(s12.fundBalance).toBe(0)
    expect(Object.values(s12.pools).reduce((a, b) => a + b, 0)).toBeCloseTo(200_000, 4)
    expect(s12.loans.find((l) => l.loanId === 'car')!.balance).toBeGreaterThan(0)
  })

  it('withdrawToWealth 目标池不存在时保留公积金，不产生幽灵池也不丢钱', () => {
    const input = makeInput({
      global: {
        startYear: 2026, startMonth: 1, endMode: 'auto',
        inflationEnabled: false, inflationRate: 0.025,
        fundMonthlyOffset: false,
        emergencyReserve: 0,
        monthlyTopUpSource: 'cash-only',
      },
      loans: [],
      incomes: [],
      living: [],
      cash: { initialBalance: 0 },
      pools: [],
      fund: {
        initialBalance: 5_000,
        annualContribution: 0,
        contributionYears: 1,
        interestRate: 0,
        maturityPolicy: 'withdrawToWealth',
        maturityPrepayEffect: 'shorten-term',
        withdrawToPoolId: 'ghost-pool',
      },
    })
    const horizon = computeHorizonMonths(input)
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, horizon)
    const last = snaps[snaps.length - 1]!
    expect(last.fundBalance).toBeCloseTo(5_000, 6)
    expect(Object.keys(last.pools)).toHaveLength(0)
    expect(last.netWorth).toBeCloseTo(5_000, 6)
  })
})

// ---------------------------------------------------------------------------
// 回归：第 0 年生效的利率规则必须在起点月重锚（月供按新利率摊还）
// ---------------------------------------------------------------------------

describe('回归：第 0 年利率规则触发初始重锚', () => {
  it('利息按新利率计且月供同步重算，恰好 24 期还清', () => {
    const input = makeInput({
      loans: [
        {
          id: 'loan-c', name: '商业贷款', kind: 'commercial', principal: 120_000,
          remainingMonths: 24, currentRate: 0.12, method: 'annuity',
          rateRules: [{ startAfterYear: 0, annualRate: 0.06 }],
        },
      ],
    })
    const horizon = computeHorizonMonths(input)
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, horizon)
    const s0 = snaps[0]!
    const correctAnchor = annuityPayment(120_000, 0.06 / 12, 24)
    // 利息用新利率
    expect(s0.cumInterest).toBeCloseTo(120_000 * 0.005, 6)
    // 月供也按新利率摊还
    expect(s0.loans[0]!.scheduledPayment).toBeCloseTo(correctAnchor, 2)
    // 恰好在第 24 个月（index 23）归零
    const payoff = snaps.find((s) => s.loans[0]!.balance === 0)
    expect(payoff?.m).toBe(23)
  })
})

// ---------------------------------------------------------------------------
// 回归：自动终点观察退休后 30 年；自定义终点含当年全年；有界重复事件完整发生
// ---------------------------------------------------------------------------

describe('回归：统一终点覆盖退休后 30 年或自定义终点全年', () => {
  function yearSpanInput(globalPatch: Parameters<typeof Object.assign>[1]): AnalysisInput {
    return makeInput({
      loans: [],
      incomes: [{ id: 'inc', startYear: 2026, endYear: 2040, annualSalary: 120_000, annualBonus: 0, bonusMonth: 1 }],
      living: [{ id: 'liv', startYear: 2026, endYear: 2045, annualAmount: 24_000 }],
      global: {
        startYear: 2026, startMonth: 1, endMode: 'auto',
        inflationEnabled: false, inflationRate: 0.025,
        fundMonthlyOffset: true, emergencyReserve: 0,
        monthlyTopUpSource: 'cash-only',
        ...globalPatch,
      } as AnalysisInput['global'],
    })
  }

  it('customEndYear=2028 模拟到 2028-12：三年净流入 288,000', () => {
    const input = yearSpanInput({ endMode: 'custom', customEndYear: 2028 })
    const h = computeHorizonMonths(input)
    expect(h).toBe(36)
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, h)
    expect(snaps[snaps.length - 1]!.cash).toBeCloseTo(36 * (10_000 - 2_000), 6)
  })

  it('自动终点为退休后 30 年，且不因有无公积金而漂移', () => {
    const noFund = yearSpanInput({ retireYear: 2036 })
    const withFund = makeInput({
      loans: [],
      incomes: [{ id: 'inc', startYear: 2026, endYear: 2040, annualSalary: 120_000, annualBonus: 0, bonusMonth: 1 }],
      living: [{ id: 'liv', startYear: 2026, endYear: 2045, annualAmount: 24_000 }],
      global: {
        startYear: 2026, startMonth: 1, endMode: 'auto',
        inflationEnabled: false, inflationRate: 0.025,
        fundMonthlyOffset: true, emergencyReserve: 0,
        monthlyTopUpSource: 'cash-only', retireYear: 2036,
      },
      fund: {
        initialBalance: 10_000, annualContribution: 12_000, contributionYears: 20,
        interestRate: 0.015, maturityPolicy: 'withdrawToWealth', maturityPrepayEffect: 'shorten-term',
      },
    })
    // 2026 起，2036 年退休后再观察 30 年，覆盖到 2066 年末 = 41 年。
    expect(computeHorizonMonths(noFund)).toBe(492)
    expect(computeHorizonMonths(withFund)).toBe(492)
  })

  it('退休时间较晚时不被旧的 50 年上限截断', () => {
    const input = yearSpanInput({ retireYear: 2056 })
    // 2026 → 2086 年末，共 61 年。
    expect(computeHorizonMonths(input)).toBe(732)
  })
})

describe('回归：有界重复事件计入统一终点', () => {
  function tuitionInput(repeat?: { everyYears: number; count?: number }): AnalysisInput {
    return makeInput({
      loans: [],
      incomes: [],
      living: [],
      cash: { initialBalance: 3_000_000 },
      lifeEvents: [
        {
          id: 'edu', type: 'big-expense', monthIndex: 0, label: '学费',
          amount: 60_000, source: 'cash',
          ...(repeat ? { repeat } : {}),
        },
      ],
    })
  }

  it('每年学费 ×10 年扣满 10 次', () => {
    const input = tuitionInput({ everyYears: 1, count: 10 })
    // 无 monthOfYear 时发生月为 0,12,…,108（共 10 次），终点须覆盖末次
    const h = computeHorizonMonths(input)
    expect(h).toBe(109)
    const { snaps } = simulateScenario(input, input.scenarios[0]!, false, h)
    expect(snaps[snaps.length - 1]!.cash).toBeCloseTo(3_000_000 - 600_000, 6)
  })

  it('无界重复不延伸终点：单独存在时保持最小 12 个月', () => {
    const input = tuitionInput({ everyYears: 1 })
    expect(computeHorizonMonths(input)).toBe(12)
  })
})

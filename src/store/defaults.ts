import { makeId } from '@/engine/ids'
import { defaultScenarios } from '@/engine/presets'
import type {
  AnalysisInput,
  FixedExpense,
  FundAccount,
  GlobalParams,
  IncomeSegment,
  LifeEvent,
  LivingExpense,
  LoanInput,
  ScenarioDef,
  WealthPool,
} from '@/engine/types'

/**
 * 默认示例画像（用户提供）：
 * - 2020 年存款 150w、公积金余额 15w；当年买房：首付 100w + 贷款 200w（商贷 150w@6.0%
 *   →2021 年 5.0% →2026 年 3.2%；公积金贷 50w）
 * - 2021 年买车：首付 5w + 车贷 15w；2023 年交房物业费 5000/年；购车起车位 4000/年
 * - 理财初始 10w，此后每年投高风险 10w、低风险 20w
 * - 月薪 3w 到 2030（年终奖 8 万·每年 8 月），2031–2040 月薪 1.5w（奖 4w），
 *   2041–2050 月薪 6000（奖 1w），2050 退休
 */

export interface AppStateData {
  global: GlobalParams
  loans: LoanInput[]
  incomes: IncomeSegment[]
  fixedExpenses: FixedExpense[]
  living: LivingExpense[]
  /** 人生事件（公共）：大额收支与定投 */
  lifeEvents: LifeEvent[]
  cash: AnalysisInput['cash']
  pools: WealthPool[]
  fund: FundAccount | null
  scenarios: ScenarioDef[]
}

export function makeDefaults(): AppStateData {
  const commercialId = makeId()
  const fundLoanId = makeId()
  const carLoanId = makeId()
  const lowPoolId = makeId()
  const highPoolId = makeId()

  const data: Omit<AppStateData, 'scenarios'> = {
    global: {
      startYear: 2020,
      startMonth: 1,
      endMode: 'auto',
      inflationEnabled: true,
      inflationRate: 0.025,
      retireYear: 2050,
      retirePensionAnnual: 0,
      fundMonthlyOffset: true,
      emergencyReserve: 100_000,
      monthlyTopUpSource: 'wealth-proportional',
    },
    loans: [
      {
        id: commercialId,
        name: '商业贷款',
        kind: 'commercial',
        principal: 1_500_000,
        remainingMonths: 360,
        currentRate: 0.06,
        method: 'annuity',
        rateRules: [
          { startAfterYear: 1, annualRate: 0.05 }, // 2021 降到 5.0
          { startAfterYear: 6, annualRate: 0.032 }, // 2026 降到 3.2
        ],
        prepayPenaltyRate: 0,
      },
      {
        id: fundLoanId,
        name: '公积金贷款',
        kind: 'fund',
        principal: 500_000,
        remainingMonths: 360,
        currentRate: 0.0325,
        method: 'annuity',
        rateRules: [{ startAfterYear: 6, annualRate: 0.026 }],
      },
      {
        id: carLoanId,
        name: '车贷',
        kind: 'other',
        principal: 150_000,
        remainingMonths: 36,
        currentRate: 0.045,
        method: 'annuity',
        rateRules: [],
        startDelayMonths: 12, // 2021 年才买的车
      },
    ],
    incomes: [
      {
        id: makeId(),
        label: '高收入期',
        startYear: 2020,
        endYear: 2030,
        annualSalary: 360_000, // 月入 3w
        annualBonus: 80_000,
        bonusMonth: 8,
      },
      {
        id: makeId(),
        label: '收入回落期',
        startYear: 2031,
        endYear: 2040,
        annualSalary: 180_000, // 月入 1.5w
        annualBonus: 40_000,
        bonusMonth: 8,
      },
      {
        id: makeId(),
        label: '退休前过渡期',
        startYear: 2041,
        endYear: 2050,
        annualSalary: 72_000, // 月入 6000
        annualBonus: 10_000,
        bonusMonth: 8,
      },
    ],
    fixedExpenses: [
      { id: makeId(), name: '物业费', startYear: 2023, endYear: 2075, annualAmount: 5_000 },
      { id: makeId(), name: '车位费', startYear: 2021, endYear: 2075, annualAmount: 4_000 },
    ],
    living: [
      { id: makeId(), startYear: 2020, endYear: 2075, annualAmount: 120_000 }, // 10w/年 + 通胀递增
    ],
    lifeEvents: [
      {
        id: makeId(),
        type: 'big-expense' as const,
        monthIndex: 0, // 2020 年初买房首付
        label: '买房首付',
        amount: 1_000_000,
        source: 'cash' as const,
      },
      {
        id: makeId(),
        type: 'big-expense' as const,
        monthIndex: 12, // 2021 年初买车首付
        label: '购车首付',
        amount: 50_000,
        source: 'cash' as const,
      },
      {
        id: makeId(),
        type: 'invest' as const,
        monthIndex: 11, // 2020 年底起
        monthOfYear: 12,
        amount: 200_000,
        poolId: lowPoolId, // 每年投低风险 20w
      },
      {
        id: makeId(),
        type: 'invest' as const,
        monthIndex: 11,
        monthOfYear: 12,
        amount: 100_000,
        poolId: highPoolId, // 每年投高风险 10w
      },
    ],
    // 150w 存款 = 活钱 140w + 初始理财 10w（进低风险池）；买房/购车首付走人生事件扣减
    cash: { initialBalance: 1_400_000 },
    pools: [
      {
        id: lowPoolId,
        name: '低风险理财',
        riskLevel: 'low',
        initialBalance: 100_000,
        expectedAnnualReturn: 0.025,
        maxLossPct: 0.02,
      },
      {
        id: highPoolId,
        name: '高风险理财',
        riskLevel: 'high',
        initialBalance: 0,
        expectedAnnualReturn: 0.06,
        maxLossPct: 0.2,
      },
    ],
    fund: {
      initialBalance: 150_000, // 公积金余额 15w
      contributionSegments: [
        { id: makeId(), startYear: 2020, endYear: 2050, annualAmount: 60_000 },
      ], // 按双边约 5000/月估计，缴存到退休
      interestRate: 0.015,
      maturityPolicy: 'withdrawToWealth', // 退休取出进理财池
      maturityPrepayEffect: 'shorten-term',
      withdrawToPoolId: lowPoolId,
    },
  }

  return {
    ...data,
    scenarios: defaultScenarios(data),
  }
}

/** 组装引擎输入 */
export function toAnalysisInput(data: AppStateData): AnalysisInput {
  return {
    global: data.global,
    loans: data.loans,
    incomes: data.incomes,
    fixedExpenses: data.fixedExpenses,
    living: data.living,
    lifeEvents: data.lifeEvents,
    cash: data.cash,
    pools: data.pools,
    fund: data.fund,
    scenarios: data.scenarios,
  }
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'
import { makeId } from '@/engine/ids'
import type {
  BigExpenseEvent,
  BigIncomeEvent,
  FixedExpense,
  FundAccount,
  FundContributionSegment,
  GlobalParams,
  Id,
  IncomeSegment,
  LifeEvent,
  LoanInput,
  LivingExpense,
  PeriodicInvestEvent,
  PrepayEvent,
  RateRule,
  ScenarioDef,
  WealthPool,
} from '@/engine/types'
import { makeDefaults, type AppStateData } from './defaults'

// ---------------------------------------------------------------------------
// 持久化数据校验（损坏即回落默认 + 控制台告警）
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1)

const rateRuleSchema = z.object({
  startAfterYear: z.number(),
  annualRate: z.number().nonnegative(),
})

const loanSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(['commercial', 'fund', 'other']),
  principal: z.number().nonnegative(),
  remainingMonths: z.number().int().positive(),
  currentRate: z.number().nonnegative(),
  method: z.enum(['annuity', 'linear']),
  rateRules: z.array(rateRuleSchema),
  prepayPenaltyRate: z.number().nonnegative().optional(),
  startDelayMonths: z.number().int().nonnegative().optional(),
})

const incomeSchema = z.object({
  id: idSchema,
  label: z.string().optional(),
  startYear: z.number(),
  endYear: z.number(),
  annualSalary: z.number().nonnegative(),
  annualBonus: z.number().nonnegative(),
  bonusMonth: z.number().int().min(1).max(12),
})

const fixedExpenseSchema = z.object({
  id: idSchema,
  name: z.string(),
  startYear: z.number(),
  endYear: z.number(),
  annualAmount: z.number().nonnegative(),
})

const livingSchema = z.object({
  id: idSchema,
  startYear: z.number(),
  endYear: z.number(),
  annualAmount: z.number().nonnegative(),
})

const repeatRuleSchema = z.object({
  everyYears: z.number().optional(),
  everyMonths: z.number().optional(),
  monthOfYear: z.number().optional(),
  count: z.number().optional(),
  untilMonth: z.number().optional(),
})

const prepayEventShape = {
  id: idSchema,
  type: z.literal('prepay'),
  monthIndex: z.number().int().nonnegative(),
  // -1 是「使用全部公积金余额」的内部特殊值。
  amount: z.union([z.literal(-1), z.number().nonnegative()]),
  effect: z.enum(['shorten-term', 'reduce-payment']),
  targetLoanId: idSchema.optional(),
  /** 'housing' = 作为「还房贷」处理，引擎在房贷内部自动分配 */
  targetGroup: z.literal('housing').optional(),
  source: z.enum(['cash', 'wealth', 'fund']),
  wealthPoolId: idSchema.optional(),
  repeat: repeatRuleSchema.optional(),
} as const

const scenarioSchema = z.object({
  id: idSchema,
  name: z.string(),
  colorSlot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  isBaseline: z.boolean(),
  /** 仅提前还款事件（人生事件存于顶层 lifeEvents） */
  events: z.array(z.object(prepayEventShape)),
})

const lifeEventSchema = z.discriminatedUnion('type', [
  z.object({
    id: idSchema,
    type: z.literal('big-expense'),
    monthIndex: z.number().int().nonnegative(),
    label: z.string(),
    amount: z.number().nonnegative(),
    source: z.enum(['cash', 'wealth', 'fund']),
    wealthPoolId: idSchema.optional(),
    repeat: repeatRuleSchema.optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('big-income'),
    monthIndex: z.number().int().nonnegative(),
    label: z.string(),
    amount: z.number().nonnegative(),
    target: z.enum(['cash', 'wealth', 'fund']),
    wealthPoolId: idSchema.optional(),
    repeat: repeatRuleSchema.optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('invest'),
    monthIndex: z.number().int().nonnegative(),
    monthOfYear: z.number().int().min(1).max(12),
    amount: z.number().nonnegative(),
    poolId: idSchema,
  }),
])

const persistedSchema = z.object({
  global: z.object({
    startYear: z.number(),
    startMonth: z.number().int().min(1).max(12),
    endMode: z.enum(['auto', 'custom']),
    customEndYear: z.number().optional(),
    inflationEnabled: z.boolean(),
    inflationRate: z.number().nonnegative(),
    retireYear: z.number().optional(),
    retirePensionAnnual: z.number().nonnegative().optional(),
    fundMonthlyOffset: z.boolean(),
    // 老数据缺省时回落 10 万，避免整体重置
    emergencyReserve: z.number().nonnegative().default(100_000),
    monthlyTopUpSource: z
      .union([z.literal('cash-only'), z.literal('wealth-proportional'), idSchema])
      .default('wealth-proportional'),
  }),
  loans: z.array(loanSchema),
  incomes: z.array(incomeSchema),
  fixedExpenses: z.array(fixedExpenseSchema),
  living: z.array(livingSchema),
  lifeEvents: z.array(lifeEventSchema),
  cash: z.object({
    initialBalance: z.number().nonnegative(),
    sweepToPoolId: idSchema.optional(),
  }),
  pools: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      riskLevel: z.enum(['high', 'medium', 'low']),
      initialBalance: z.number().nonnegative(),
      expectedAnnualReturn: z.number(),
      maxLossPct: z.number().nonnegative(),
    }),
  ),
  fund: z
    .object({
      initialBalance: z.number().nonnegative(),
      contributionSegments: z.array(z.object({
        id: idSchema,
        startYear: z.number(),
        endYear: z.number(),
        annualAmount: z.number().nonnegative(),
      })).optional(),
      // 兼容 v1 本地备份；读取时迁移到一段缴存计划。
      annualContribution: z.number().nonnegative().optional(),
      contributionYears: z.number().nonnegative().optional(),
      interestRate: z.number().nonnegative(),
      maturityPolicy: z.enum(['hold', 'lumpPrepay', 'withdrawToWealth']),
      maturityPrepayEffect: z.enum(['shorten-term', 'reduce-payment']),
      withdrawToPoolId: idSchema.optional(),
    })
    .nullable(),
  scenarios: z.array(scenarioSchema).min(1),
})

// ---------------------------------------------------------------------------
// UI 瞬态（不持久化）
// ---------------------------------------------------------------------------

export type ViewMode = 'expected' | 'stress' | 'overlay'

interface UiState {
  viewMode: ViewMode
  activeScenarioId: Id | null
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AppActions {
  setGlobal: (patch: Partial<GlobalParams>) => void

  addLoan: (kind: LoanInput['kind']) => void
  updateLoan: (id: Id, patch: Partial<LoanInput>) => void
  removeLoan: (id: Id) => void
  addRateRule: (loanId: Id) => void
  updateRateRule: (loanId: Id, index: number, patch: Partial<RateRule>) => void
  removeRateRule: (loanId: Id, index: number) => void

  addIncomeSegment: () => void
  updateIncomeSegment: (id: Id, patch: Partial<IncomeSegment>) => void
  removeIncomeSegment: (id: Id) => void

  addFixedExpense: () => void
  updateFixedExpense: (id: Id, patch: Partial<FixedExpense>) => void
  removeFixedExpense: (id: Id) => void

  addLivingSegment: () => void
  updateLivingSegment: (id: Id, patch: Partial<LivingExpense>) => void
  removeLivingSegment: (id: Id) => void

  updateCash: (patch: Partial<AppStateData['cash']>) => void
  addPool: (riskLevel: WealthPool['riskLevel']) => void
  updatePool: (id: Id, patch: Partial<WealthPool>) => void
  removePool: (id: Id) => void

  updateFund: (patch: Partial<FundAccount>) => void
  addFundContributionSegment: () => void
  updateFundContributionSegment: (id: Id, patch: Partial<FundContributionSegment>) => void
  removeFundContributionSegment: (id: Id) => void
  /** 整体设置（含 null=停用公积金） */
  setFundAccount: (fund: FundAccount | null) => void

  addScenario: () => void
  duplicateScenario: (id: Id) => void
  removeScenario: (id: Id) => void
  renameScenario: (id: Id, name: string) => void
  addEvent: (scenarioId: Id, event: PrepayEvent) => void
  updateEvent: (scenarioId: Id, eventId: Id, patch: Partial<PrepayEvent>) => void
  /** 整体替换方案还款计划（预设模板用） */
  setScenarioEvents: (scenarioId: Id, events: PrepayEvent[]) => void

  /** 人生事件（公共）：大额收支与定投 */
  addLifeEvent: (event: LifeEvent) => void
  updateLifeEvent: (eventId: Id, patch: Partial<LifeEvent>) => void
  removeLifeEvent: (eventId: Id) => void
  removeEvent: (scenarioId: Id, eventId: Id) => void

  setViewMode: (mode: ViewMode) => void
  setActiveScenario: (id: Id | null) => void
  resetAll: () => void
  /** 导入完整数据快照（zod 校验失败返回 false） */
  importAll: (raw: unknown) => boolean
}

export type AppStore = AppStateData & UiState & AppActions

const STORAGE_KEY = 'mortgage-analyzer:v1'

/** 将 v1 的固定缴存字段迁移为按年分段的缴存时间线。 */
function normalizeFund(
  fund: z.infer<typeof persistedSchema>['fund'],
  startYear: number,
): FundAccount | null {
  if (!fund) return null
  const { annualContribution, contributionYears, contributionSegments, ...rest } = fund
  return {
    ...rest,
    contributionSegments: contributionSegments ?? [{
      id: makeId(),
      startYear,
      endYear: startYear + Math.max(0, (contributionYears ?? 0) - 1),
      annualAmount: annualContribution ?? 0,
    }],
  }
}

function nextColorSlot(scenarios: ScenarioDef[]): 1 | 2 | 3 | 4 {
  const used = new Set(scenarios.map((s) => s.colorSlot))
  for (const slot of [1, 2, 3, 4] as const) {
    if (!used.has(slot)) return slot
  }
  return 1
}

/** 新增贷款的常见默认值 */
function makeLoanPreset(kind: LoanInput['kind']): LoanInput {
  const id = makeId()
  switch (kind) {
    case 'commercial':
      return {
        id, name: '商业贷款', kind, principal: 500_000, remainingMonths: 240,
        currentRate: 0.036, method: 'annuity', rateRules: [],
      }
    case 'fund':
      return {
        id, name: '公积金贷款', kind, principal: 400_000, remainingMonths: 240,
        currentRate: 0.0285, method: 'annuity', rateRules: [],
      }
    case 'other':
      // 常见车贷画像：15 万 / 3 年 / 4.5%
      return {
        id, name: '车贷', kind, principal: 150_000, remainingMonths: 36,
        currentRate: 0.045, method: 'annuity', rateRules: [],
      }
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...makeDefaults(),
      viewMode: 'expected',
      activeScenarioId: null,

      // ---- global ----
      setGlobal: (patch) => set((s) => ({ global: { ...s.global, ...patch } })),

      // ---- loans ----
      addLoan: (kind) =>
        set((s) => ({
          loans: [
            ...s.loans,
            makeLoanPreset(kind),
          ],
        })),
      updateLoan: (id, patch) =>
        set((s) => ({
          loans: s.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      removeLoan: (id) => set((s) => ({ loans: s.loans.filter((l) => l.id !== id) })),
      addRateRule: (loanId) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === loanId
              ? {
                  ...l,
                  rateRules: [
                    ...l.rateRules,
                    { startAfterYear: l.rateRules.length + 1, annualRate: l.currentRate },
                  ],
                }
              : l,
          ),
        })),
      updateRateRule: (loanId, index, patch) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === loanId
              ? {
                  ...l,
                  rateRules: l.rateRules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
                }
              : l,
          ),
        })),
      removeRateRule: (loanId, index) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === loanId ? { ...l, rateRules: l.rateRules.filter((_, i) => i !== index) } : l,
          ),
        })),

      // ---- incomes ----
      addIncomeSegment: () =>
        set((s) => {
          const last = s.incomes[s.incomes.length - 1]
          const startYear = last ? last.endYear + 1 : s.global.startYear
          return {
            incomes: [
              ...s.incomes,
              { id: makeId(), startYear, endYear: startYear + 4, annualSalary: 300_000, annualBonus: 0, bonusMonth: 12 },
            ],
          }
        }),
      updateIncomeSegment: (id, patch) =>
        set((s) => ({
          incomes: s.incomes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),
      removeIncomeSegment: (id) =>
        set((s) => ({ incomes: s.incomes.filter((i) => i.id !== id) })),

      // ---- fixed expenses ----
      addFixedExpense: () =>
        set((s) => ({
          fixedExpenses: [
            ...s.fixedExpenses,
            { id: makeId(), name: '新固定支出', startYear: s.global.startYear, endYear: 2070, annualAmount: 5_000 },
          ],
        })),
      updateFixedExpense: (id, patch) =>
        set((s) => ({
          fixedExpenses: s.fixedExpenses.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),
      removeFixedExpense: (id) =>
        set((s) => ({ fixedExpenses: s.fixedExpenses.filter((i) => i.id !== id) })),

      // ---- living ----
      addLivingSegment: () =>
        set((s) => {
          const last = s.living[s.living.length - 1]
          const startYear = last ? last.endYear + 1 : s.global.startYear
          return {
            living: [...s.living, { id: makeId(), startYear, endYear: startYear + 4, annualAmount: 100_000 }],
          }
        }),
      updateLivingSegment: (id, patch) =>
        set((s) => ({ living: s.living.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      removeLivingSegment: (id) => set((s) => ({ living: s.living.filter((i) => i.id !== id) })),

      // ---- cash / pools ----
      updateCash: (patch) => set((s) => ({ cash: { ...s.cash, ...patch } })),
      addPool: (riskLevel) =>
        set((s) => ({
          pools: [
            ...s.pools,
            {
              id: makeId(),
              name:
                riskLevel === 'high'
                  ? '高风险理财'
                  : riskLevel === 'medium'
                    ? '中风险理财'
                    : '低风险理财',
              riskLevel,
              initialBalance: 100_000,
              expectedAnnualReturn:
                riskLevel === 'high' ? 0.06 : riskLevel === 'medium' ? 0.04 : 0.025,
              maxLossPct: riskLevel === 'high' ? 0.2 : riskLevel === 'medium' ? 0.1 : 0.02,
            },
          ],
        })),
      updatePool: (id, patch) =>
        set((s) => ({ pools: s.pools.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePool: (id) => set((s) => ({ pools: s.pools.filter((p) => p.id !== id) })),

      // ---- fund ----
      updateFund: (patch) =>
        set((s) => (s.fund ? { fund: { ...s.fund, ...patch } } : {})),
      setFundAccount: (fund) => set({ fund }),
      addFundContributionSegment: () => set((s) => {
        if (!s.fund) return {}
        const segments = s.fund.contributionSegments ?? []
        const last = segments[segments.length - 1]
        const startYear = last ? last.endYear + 1 : s.global.startYear
        return {
          fund: {
            ...s.fund,
            contributionSegments: [
              ...segments,
              { id: makeId(), startYear, endYear: startYear + 4, annualAmount: 48_000 },
            ],
          },
        }
      }),
      updateFundContributionSegment: (id, patch) => set((s) =>
        s.fund ? {
          fund: {
            ...s.fund,
            contributionSegments: (s.fund.contributionSegments ?? []).map((segment) =>
              segment.id === id ? { ...segment, ...patch } : segment,
            ),
          },
        } : {},
      ),
      removeFundContributionSegment: (id) => set((s) =>
        s.fund ? {
          fund: { ...s.fund, contributionSegments: (s.fund.contributionSegments ?? []).filter((segment) => segment.id !== id) },
        } : {},
      ),

      // ---- scenarios & events ----
      addScenario: () =>
        set((s) => ({
          scenarios: [
            ...s.scenarios,
            {
              id: makeId(),
              name: `方案 ${s.scenarios.length + 1}`,
              colorSlot: nextColorSlot(s.scenarios),
              isBaseline: false,
              events: [],
            },
          ],
        })),
      duplicateScenario: (id) =>
        set((s) => {
          const src = s.scenarios.find((x) => x.id === id)
          if (!src) return {}
          const copy: ScenarioDef = {
            ...src,
            id: makeId(),
            name: `${src.name} 副本`,
            isBaseline: false,
            colorSlot: nextColorSlot(s.scenarios),
            events: src.events.map((e) => ({ ...e, id: makeId() })),
          }
          return { scenarios: [...s.scenarios, copy] }
        }),
      removeScenario: (id) =>
        set((s) => {
          const target = s.scenarios.find((x) => x.id === id)
          if (!target || target.isBaseline || s.scenarios.length <= 1) return {}
          return { scenarios: s.scenarios.filter((x) => x.id !== id) }
        }),
      renameScenario: (id, name) =>
        set((s) => ({
          scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, name } : x)),
        })),
      addEvent: (scenarioId, event) =>
        set((s) => ({
          scenarios: s.scenarios.map((x) =>
            x.id === scenarioId ? { ...x, events: [...x.events, event] } : x,
          ),
        })),
      updateEvent: (scenarioId, eventId, patch) =>
        set((s) => ({
          scenarios: s.scenarios.map((x) =>
            x.id === scenarioId
              ? {
                  ...x,
                  events: x.events.map((e) =>
                    e.id === eventId ? ({ ...e, ...patch } as PrepayEvent) : e,
                  ),
                }
              : x,
          ),
        })),
      removeEvent: (scenarioId, eventId) =>
        set((s) => ({
          scenarios: s.scenarios.map((x) =>
            x.id === scenarioId ? { ...x, events: x.events.filter((e) => e.id !== eventId) } : x,
          ),
        })),
      setScenarioEvents: (scenarioId, events) =>
        set((s) => ({
          scenarios: s.scenarios.map((x) => (x.id === scenarioId ? { ...x, events } : x)),
        })),

      // ---- 人生事件（公共） ----
      addLifeEvent: (event) => set((s) => ({ lifeEvents: [...s.lifeEvents, event] })),
      updateLifeEvent: (eventId, patch) =>
        set((s) => ({
          lifeEvents: s.lifeEvents.map((e) =>
            e.id === eventId ? ({ ...e, ...patch } as LifeEvent) : e,
          ),
        })),
      removeLifeEvent: (eventId) =>
        set((s) => ({ lifeEvents: s.lifeEvents.filter((e) => e.id !== eventId) })),

      // ---- ui ----
      setViewMode: (mode) => set({ viewMode: mode }),
      setActiveScenario: (id) => set({ activeScenarioId: id }),
      resetAll: () => set({ ...makeDefaults(), viewMode: 'expected', activeScenarioId: null }),
      importAll: (raw) => {
        const parsed = persistedSchema.safeParse(raw)
        if (!parsed.success) return false
        set({ ...parsed.data, fund: normalizeFund(parsed.data.fund, parsed.data.global.startYear) })
        return true
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      // 只持久化数据，不持久化 UI 瞬态
      partialize: (s) => ({
        global: s.global,
        loans: s.loans,
        incomes: s.incomes,
        fixedExpenses: s.fixedExpenses,
        living: s.living,
        lifeEvents: s.lifeEvents,
        cash: s.cash,
        pools: s.pools,
        fund: s.fund,
        scenarios: s.scenarios,
      }),
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted)
        if (!parsed.success) {
          console.warn('[该还不还] 本地数据校验失败，已重置为默认示例', parsed.error.issues.slice(0, 3))
          return current
        }
        // 旧版只有“年缴存额 + 缴存年数”，以当前起点迁移为一条时间线。
        const fund = normalizeFund(parsed.data.fund, parsed.data.global.startYear)
        return { ...current, ...parsed.data, fund }
      },
    },
  ),
)

// ---- 便捷类型导出 ----
export type { PrepayEvent, BigExpenseEvent, BigIncomeEvent, PeriodicInvestEvent }

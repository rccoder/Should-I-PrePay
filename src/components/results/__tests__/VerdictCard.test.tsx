// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VerdictCard } from '../VerdictCard'
import type {
  AnalysisResult,
  MonthSnap,
  PeaceScore,
  ScenarioMetrics,
  ScenarioOutcome,
} from '@/engine/types'

afterEach(cleanup)

/**
 * 结论卡对盈亏平衡穿越点的措辞纪律：
 * - 恰好一个穿越点 → 给出确定的临界值（「超过 X% 就不该还」）
 * - 多个穿越点 → f(r) 非单调，禁止给单一临界结论，改为提示多个平衡点
 */

const noopSnap: MonthSnap = {
  m: 0, loans: [], cash: 0, pools: {}, fundBalance: 0,
  cumInterest: 0, cumPrincipal: 0, cumTotalPaid: 0,
  netWorth: 0, brokeThisMonth: false, monthlyOutgo: 0,
}

const cleanScore: PeaceScore = {
  score: 80, band: 'stable', currentCoverage: 40, worstCoverage: 30,
  worstMonth: 6, stressWorstCoverage: 20, brokeFromBase: null,
  brokeMonthsBase: 0, brokeMonthsStress: 0,
}

function metrics(realSaving: number, nominalSaving: number): ScenarioMetrics {
  return {
    totalPaid: 100_000, totalInterest: 20_000, payoffMonthByLoan: {},
    endNetWorth: realSaving, realSavingVsBaseline: realSaving,
    nominalInterestSaving: nominalSaving,
  }
}

function outcome(id: string, real: number, nominal: number): ScenarioOutcome {
  return {
    scenarioId: id,
    base: { snaps: [noopSnap], warnings: [] },
    stress: { snaps: [noopSnap], warnings: [] },
    metrics: metrics(real, nominal),
    score: cleanScore,
  }
}

function makeResult(crossings: number[]): AnalysisResult {
  return {
    horizonMonths: 120,
    baselineId: 'base',
    outcomes: {
      base: outcome('base', 0, 0),
      plan: outcome('plan', 5_000, 8_000),
    },
    breakeven: { rates: [0, 0.05, 0.1], savings: [1_000, 0, -1_000], crossings },
  }
}

function renderCard(crossings: number[]) {
  return render(
    <VerdictCard
      result={makeResult(crossings)}
      activeScenarioId={null}
      pools={[]}
      scenarioName={() => '测试方案'}
    />,
  )
}

describe('VerdictCard 盈亏平衡结论措辞', () => {
  it('唯一穿越点：给出确定的临界收益率', () => {
    renderCard([0.03])
    expect(screen.getByText(/就不该还/)).toBeTruthy()
    expect(screen.getByText(/3\.0%/)).toBeTruthy()
  })

  it('多个穿越点：不给单一临界结论，改为提示多个平衡点', () => {
    renderCard([0.02, 0.07])
    expect(screen.queryByText(/就不该还/)).toBeNull()
    expect(screen.getByText(/2 个盈亏平衡点/)).toBeTruthy()
  })

  it('无穿越点：不出现盈亏平衡句', () => {
    renderCard([])
    expect(screen.queryByText(/盈亏平衡/)).toBeNull()
  })
})

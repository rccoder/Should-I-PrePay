import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { runAnalysis } from '@/engine'
import type { AnalysisResult } from '@/engine/types'
import { toAnalysisInput } from '@/store/defaults'
import { useAppStore } from '@/store/useAppStore'

/**
 * 输入 → 结果的 memoized 重算管线。
 * 引擎全量重算毫秒级，滑块 onChange 直接改 store 即可实时联动，无需 debounce。
 */
export function useAnalysis(): AnalysisResult {
  const data = useAppStore(
    useShallow((s) => ({
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
    })),
  )
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)

  return useMemo(() => {
    const input = toAnalysisInput(data)
    const baseline = input.scenarios.find((x) => x.isBaseline) ?? input.scenarios[0]
    const breakevenScenarioId =
      activeScenarioId && activeScenarioId !== baseline?.id
        ? activeScenarioId
        : input.scenarios.find((x) => x.id !== baseline?.id)?.id
    return runAnalysis(input, { breakevenScenarioId })
    // data 内层引用由 zustand 浅比较保证只在真正变化时更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeScenarioId])
}

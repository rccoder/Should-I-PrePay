import { useCallback, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'

/** JSON 备份导出/导入（localStorage 之外的第二保险） */
export function useExportImport() {
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = useCallback(() => {
    const s = useAppStore.getState()
    const data = {
      app: 'should-i-prepay',
      version: 1,
      exportedAt: new Date().toISOString(),
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
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `该还不还-备份-${s.global.startYear}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importJson = useCallback(async (file: File): Promise<boolean> => {
    try {
      const text = await file.text()
      return useAppStore.getState().importAll(JSON.parse(text))
    } catch {
      return false
    }
  }, [])

  /** 触发文件选择；结果回调 ok=false 表示解析/校验失败 */
  const pickAndImport = useCallback(
    (onDone: (ok: boolean) => void) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        onDone(await importJson(file))
      }
      input.click()
    },
    [importJson],
  )

  return { exportJson, pickAndImport, fileRef }
}

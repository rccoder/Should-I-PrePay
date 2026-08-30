import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { SCENARIO_COLORS } from '@/config/chart-theme'

/** 方案 Tabs：选中态高亮、增删复制；基准方案不可删 */
export function ScenarioBar() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const scenarios = useAppStore((s) => s.scenarios)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const setActiveScenario = useAppStore((s) => s.setActiveScenario)
  const addScenario = useAppStore((s) => s.addScenario)
  const duplicateScenario = useAppStore((s) => s.duplicateScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)
  const renameScenario = useAppStore((s) => s.renameScenario)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {scenarios.map((sc) => {
        const active = sc.id === activeScenarioId
        return (
          <div
            key={sc.id}
            className={`group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'border-foreground/30 bg-accent font-medium'
                : 'bg-card hover:bg-accent/60'
            }`}
          >
            {editingId === sc.id ? (
              <input
                autoFocus
                value={sc.name}
                onChange={(e) => renameScenario(sc.id, e.target.value)}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.currentTarget.blur()
                  }
                }}
                size={Math.max(4, sc.name.length)}
                aria-label="方案名称"
                className="w-auto bg-transparent outline-none focus:underline"
              />
            ) : (
              <button
                className="flex items-center gap-1.5"
                onClick={() => setActiveScenario(active ? null : sc.id)}
                title={active ? '取消选中（对比全部方案）' : '选中该方案（盈亏平衡分析对象）'}
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SCENARIO_COLORS[sc.colorSlot] }}
                />
                <span>{sc.name}</span>
              </button>
            )}
            {!sc.isBaseline && (
              <>
                <button
                  className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  onClick={() => setEditingId(sc.id)}
                  title="重命名方案"
                >
                  改名
                </button>
                <button
                  className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  onClick={() => duplicateScenario(sc.id)}
                  title="复制方案"
                >
                  复制
                </button>
                {scenarios.length > 1 && (
                  <button
                    className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    onClick={() => removeScenario(sc.id)}
                    title="删除方案"
                  >
                    ✕
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={addScenario}>
        + 方案
      </Button>
    </div>
  )
}

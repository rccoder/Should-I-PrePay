import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { SCENARIO_COLORS } from '@/config/chart-theme'

/** 方案 Tabs：选中态高亮、增删复制；基准方案不可删 */
export function ScenarioBar() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const scenarios = useAppStore((s) => s.scenarios)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const setActiveScenario = useAppStore((s) => s.setActiveScenario)
  const addScenario = useAppStore((s) => s.addScenario)
  const duplicateScenario = useAppStore((s) => s.duplicateScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)
  const renameScenario = useAppStore((s) => s.renameScenario)
  const selectedId = activeScenarioId ?? scenarios.find((scenario) => !scenario.isBaseline)?.id ?? scenarios[0]?.id

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="还款方案" className="flex overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {scenarios.map((sc) => {
          const active = sc.id === selectedId
          return <div key={sc.id} className="relative min-w-28 flex-1">
            <button
              role="tab"
              aria-selected={active}
              onClick={() => setActiveScenario(sc.id)}
              onDoubleClick={() => !sc.isBaseline && setEditingId(sc.id)}
              title={sc.isBaseline ? '基准方案' : '单击切换方案；双击名称改名'}
              className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-md px-7 py-3 text-sm transition-colors ${active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
            >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SCENARIO_COLORS[sc.colorSlot] }}
                />
                {editingId === sc.id ? <input autoFocus value={sc.name} onClick={(event) => event.stopPropagation()} onChange={(e) => renameScenario(sc.id, e.target.value)} onBlur={() => setEditingId(null)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} aria-label="方案名称" className="w-20 bg-transparent text-center outline-none focus:underline" /> : <span>{sc.name}</span>}
            </button>
            {!sc.isBaseline && <div className="absolute right-1.5 top-1.5">
              <button className="flex h-6 w-6 items-center justify-center rounded text-lg leading-none text-muted-foreground hover:bg-accent hover:text-foreground" title="方案操作" aria-label={`${sc.name} 的更多操作`} onClick={(event) => { event.stopPropagation(); setMenuId(menuId === sc.id ? null : sc.id) }}>⋯</button>
              {menuId === sc.id && <div className="absolute right-0 top-7 z-20 w-24 rounded-md border bg-popover p-1 text-xs shadow-md">
                <button className="w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => { duplicateScenario(sc.id); setMenuId(null) }}>复制方案</button>
                <button className="w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-accent" onClick={() => { setMenuId(null); if (window.confirm(`确定删除「${sc.name}」吗？此操作无法撤销。`)) removeScenario(sc.id) }}>删除方案</button>
              </div>}
            </div>}
          </div>
        })}
        <button className="ml-1 flex h-14 w-12 shrink-0 items-center justify-center rounded-md text-2xl text-muted-foreground hover:bg-background hover:text-foreground" title="新增方案" aria-label="新增方案" onClick={addScenario}>+</button>
      </div>
    </div>
  )
}

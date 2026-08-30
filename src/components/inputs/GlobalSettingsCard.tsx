import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { IntInput, MoneyInput } from '@/components/fields/NumberField'

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** 全局设置：模拟起点、退休年（领退休金/可取公积金）、模拟终点 */
export function GlobalSettingsFields({ maxStressYear }: { maxStressYear?: number }) {
  const global = useAppStore((s) => s.global)
  const pools = useAppStore((s) => s.pools)
  const setGlobal = useAppStore((s) => s.setGlobal)
  useEffect(() => {
    if (maxStressYear === undefined || global.stressDrawdownYear === undefined) return
    if (global.stressDrawdownYear > maxStressYear) setGlobal({ stressDrawdownYear: maxStressYear })
  }, [global.stressDrawdownYear, maxStressYear, setGlobal])

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">起始年（「现在」）</span>
          <IntInput
            value={global.startYear}
            min={1990}
            max={2120}
            onChange={(v) => setGlobal({ startYear: v })}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">起始月</span>
          <select
            value={global.startMonth}
            onChange={(e) => setGlobal({ startMonth: Number(e.target.value) })}
            className={selectCls}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} 月
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">退休年（领取退休金/可取公积金）</span>
          <IntInput
            value={global.retireYear ?? NaN}
            min={1990}
            max={2120}
            onChange={(v) => setGlobal({ retireYear: Number.isFinite(v) && v > 0 ? v : undefined })}
            placeholder="未设置"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">模拟终点</span>
          <select
            value={global.endMode}
            onChange={(e) => setGlobal({ endMode: e.target.value as 'auto' | 'custom' })}
            className={selectCls}
          >
            <option value="auto">自动（退休后30年/还清取晚）</option>
            <option value="custom">自定义年份</option>
          </select>
        </label>
      </div>
      {global.endMode === 'custom' && (
        <label className="block space-y-1">
          <span className="block text-xs text-muted-foreground">终点年</span>
          <IntInput
            value={global.customEndYear ?? NaN}
            min={1990}
            max={2120}
            onChange={(v) =>
              setGlobal({ customEndYear: Number.isFinite(v) && v > 0 ? v : undefined })
            }
          />
        </label>
      )}
      <div className="block space-y-1">
        <span className="block text-xs text-muted-foreground">压力测试：一次性年度最大回撤</span>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={global.stressDrawdownEnabled ?? false} onChange={(e) => setGlobal({ stressDrawdownEnabled: e.target.checked })} />
          开启压力测试
        </label>
        {global.stressDrawdownEnabled && <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">回撤发生年份：{global.stressDrawdownYear ?? global.startYear}</span>
          <input type="range" min={global.startYear} max={maxStressYear ?? global.startYear + 100} step={1} value={Math.min(maxStressYear ?? global.startYear + 100, Math.max(global.startYear, global.stressDrawdownYear ?? global.startYear))} onChange={(e) => setGlobal({ stressDrawdownYear: Number(e.target.value) })} className="w-full" />
          <span className="block text-[11px] leading-relaxed text-muted-foreground">该年年初按各理财池的最大回撤扣减一次，之后恢复正常预期收益；不是连续亏损。</span>
        </label>}
      </div>
      <label className="block space-y-1">
        <span className="block text-xs text-muted-foreground">应急活钱底线（只能活期）</span>
        <MoneyInput
          value={global.emergencyReserve ?? 0}
          onChange={(v) => setGlobal({ emergencyReserve: v })}
        />
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          始终保留在活钱里应对特殊情况：定投和现金类提前还款不会动用它；生活开销、月供与大额支出可以用（它们正是「特殊情况」）。
        </span>
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-muted-foreground">月供缺口补足来源（公积金月冲+活钱都不够时）</span>
        <select
          value={global.monthlyTopUpSource ?? 'cash-only'}
          onChange={(e) =>
            setGlobal({ monthlyTopUpSource: e.target.value as never })
          }
          className={selectCls}
        >
          <option value="cash-only">自动从理财池支取（兼容旧设置）</option>
          <option value="wealth-proportional">理财池按余额比例支取</option>
          {pools.map((p) => (
            <option key={p.id} value={p.id}>
              只从「{p.name}」支取
            </option>
          ))}
        </select>
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          启用后一旦开始花理财还月供，预警区会明确提示。
        </span>
      </label>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        所有收支年份段、事件时间都相对这个起点；改起点不会移动它们，但含义随之变化。
        退休年后公积金停止缴存、余额按公积金卡片的设置处理。
      </p>
    </div>
  )
}

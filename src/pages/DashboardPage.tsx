import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useExportImport } from '@/hooks/useExportImport'
import { deriveMilestones } from '@/engine/milestones'
import { TimelineEditor } from '@/components/timeline/TimelineEditor'
import { useAnalysis } from '@/hooks/useAnalysis'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoanListEditor } from '@/components/inputs/LoanListEditor'
import {
  ExpenseEditors,
  IncomeSegmentEditor,
} from '@/components/inputs/IncomeExpenseEditors'
import { AccountEditors } from '@/components/inputs/AccountEditors'
import {
  LifeEventEditor,
  ScenarioPrepayEditor,
} from '@/components/inputs/EventEditors'
import { GlobalSettingsFields } from '@/components/inputs/GlobalSettingsCard'
import { ComparisonTable } from '@/components/results/ComparisonTable'
import { ScenarioBar } from '@/components/results/ScenarioBar'
import { MetricTiles } from '@/components/results/MetricTiles'
import { PeaceScoreCard } from '@/components/results/PeaceScoreCard'
import { VerdictCard } from '@/components/results/VerdictCard'
import { WarningsPanel } from '@/components/results/WarningsPanel'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { LoanBalanceChart } from '@/components/charts/LoanBalanceChart'
import { LiquidityChart } from '@/components/charts/LiquidityChart'
import { CashBalanceChart } from '@/components/charts/CashBalanceChart'
import { InterestCompareChart } from '@/components/charts/InterestCompareChart'
import { BreakevenChart } from '@/components/charts/BreakevenChart'
import type { ViewMode } from '@/store/useAppStore'

const VIEW_MODES: Array<{ key: ViewMode; label: string }> = [
  { key: 'expected', label: '预期' },
  { key: 'stress', label: '压力' },
  { key: 'overlay', label: '叠加' },
]

export function DashboardPage() {
  const global = useAppStore((s) => s.global)
  const scenarios = useAppStore((s) => s.scenarios)
  const pools = useAppStore((s) => s.pools)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const resetAll = useAppStore((s) => s.resetAll)
  const result = useAnalysis()
  const { exportJson, pickAndImport } = useExportImport()

  // 宽心指数卡：基准 + 当前选中方案（缺省第一个非基准）
  const scoreScenarios = useMemo(() => {
    const baseline = scenarios.find((x) => x.isBaseline) ?? scenarios[0]
    const others = scenarios.filter((x) => !x.isBaseline)
    const focus =
      (activeScenarioId && others.find((x) => x.id === activeScenarioId)) || others[0]
    const list = [baseline, ...(focus ? [focus] : [])].filter(
      (x): x is NonNullable<typeof x> => Boolean(x),
    )
    return list
  }, [scenarios, activeScenarioId])

  const currentReturn = useMemo(() => {
    const total = pools.reduce((a, p) => a + p.initialBalance, 0)
    if (total <= 0) return 0
    return pools.reduce((a, p) => a + p.expectedAnnualReturn * p.initialBalance, 0) / total
  }, [pools])

  // 时间轴关键节点：取聚焦方案（与盈亏平衡/结论卡一致），缺省基准
  const milestones = useMemo(() => {
    const focused =
      (activeScenarioId && result.outcomes[activeScenarioId]) ||
      Object.values(result.outcomes).find((o) => o.scenarioId !== result.baselineId) ||
      result.outcomes[result.baselineId]
    if (!focused) return []
    return deriveMilestones(focused, {
      global,
      fund: useAppStore.getState().fund,
      loans: useAppStore.getState().loans,
      incomes: useAppStore.getState().incomes,
    })
  }, [result, activeScenarioId, global])

  return (
    <div className="min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3">
          <div>
            <h1 className="text-base font-semibold leading-tight">该还不还</h1>
            <p className="text-[11px] text-muted-foreground">人生现金流与提前还款决策分析</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border">
              {VIEW_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    viewMode === m.key
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pickAndImport((ok) => alert(ok ? '导入成功' : '导入失败：文件格式不正确'))}
              title="从 JSON 备份恢复"
            >
              导入
            </Button>
            <Button variant="ghost" size="sm" onClick={exportJson} title="下载 JSON 备份">
              导出
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!window.confirm('确定重置？将清空 localStorage 中的全部数据并恢复为默认示例。')) {
                  return
                }
                try {
                  useAppStore.persist.clearStorage()
                } catch {
                  /* ignore */
                }
                window.localStorage.removeItem('mortgage-analyzer:v1')
                resetAll()
              }}
              title="清空 localStorage 并恢复默认示例"
            >
              重置
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-4">
        <ScenarioBar />

        <section className="mt-2 rounded-lg border bg-muted/35 px-3 py-2.5">
          <p className="text-xs font-medium">默认方案怎么读？</p>
          <div className="mt-2 grid gap-2 text-[11px] leading-relaxed text-muted-foreground md:grid-cols-3">
            <p>
              <span className="font-medium text-foreground">只做月冲：</span>
              每月房贷优先从公积金扣，不足部分再从活钱或按你的设置从理财补；不做提前还款。
            </p>
            <p>
              <span className="font-medium text-foreground">月冲 + 公积金年冲：</span>
              在月冲基础上，每年 12 月月冲后，把公积金账户截至当月的全部余额提前还房贷。
            </p>
            <p>
              <span className="font-medium text-foreground">月冲 + 年冲 + 额外还款：</span>
              保留公积金年冲，并在每年 12 月额外还一笔房贷；金额、年份、来源都能在下方改。
            </p>
          </div>
        </section>

        <section className="mt-4">
          <MetricTiles result={result} scenarios={scenarios} global={global} />
        </section>

        <section className="mt-4 space-y-4">
          <VerdictCard
            result={result}
            activeScenarioId={activeScenarioId}
            pools={pools}
            scenarioName={(id) => scenarios.find((x) => x.id === id)?.name ?? id}
          />
          {scoreScenarios.map((sc) => {
            const outcome = result.outcomes[sc.id]
            if (!outcome) return null
            return (
              <PeaceScoreCard
                key={sc.id}
                name={sc.name}
                color={`var(--chart-slot-${sc.colorSlot})`}
                score={outcome.score}
              />
            )
          })}
        </section>

        {/* 时间轴：关键节点 + 计划事件（纯展示） */}
        <section className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">时间轴 · 关键节点与计划事件</CardTitle>
              <p className="text-xs text-muted-foreground">
                菱形节点由当前选中方案推导（悬停看时间）：断裂/花理财/活钱见底等风险点，
                以及还清、退休、收入变化。修改计划请用左栏「⑤⑥」编辑器。
              </p>
            </CardHeader>
            <CardContent>
              <TimelineEditor horizon={result.horizonMonths} milestones={milestones} />
            </CardContent>
          </Card>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {/* 左栏：输入 */}
          <div className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">⓪ 全局设置</CardTitle>
              </CardHeader>
              <CardContent>
                <GlobalSettingsFields />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">① 贷款</CardTitle>
              </CardHeader>
              <CardContent>
                <LoanListEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">② 收入时间线</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeSegmentEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">③ 支出</CardTitle>
              </CardHeader>
              <CardContent>
                <ExpenseEditors />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">④ 资产账户</CardTitle>
              </CardHeader>
              <CardContent>
                <AccountEditors />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">⑤ 人生大事（所有方案共享）</CardTitle>
              </CardHeader>
              <CardContent>
                <LifeEventEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">⑥ 提前还款计划（按方案）</CardTitle>
              </CardHeader>
              <CardContent>
                <ScenarioPrepayEditor />
              </CardContent>
            </Card>
          </div>

          {/* 右侧：图表区 */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">预警</CardTitle>
              </CardHeader>
              <CardContent>
                <WarningsPanel
                  result={result}
                  scenarios={scenarios}
                  startYear={global.startYear}
                  startMonth={global.startMonth}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">流动资产（活钱+理财）</CardTitle>
                <p className="text-xs text-muted-foreground">
                  全部可动用的钱。收入断崖后靠存款过日子的下降段在这里最直观；虚线为压力情形。
                </p>
              </CardHeader>
              <CardContent>
                <LiquidityChart
                  result={result}
                  scenarios={scenarios}
                  startYear={global.startYear}
                  startMonth={global.startMonth}
                  viewMode={viewMode}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">净资产演化</CardTitle>
                <p className="text-xs text-muted-foreground">
                  各方案（活钱+理财+公积金−贷款余额，不含房产）随时间的走势。
                  买房初期为负是正常现象——房贷全额计负债而房子不计资产；
                  方案之间谁高谁低才是这张图的结论。虚线为压力情形（理财收益按「预期−最大亏损」模拟）。
                </p>
              </CardHeader>
              <CardContent>
                <NetWorthChart
                  result={result}
                  scenarios={scenarios}
                  startYear={global.startYear}
                  startMonth={global.startMonth}
                  viewMode={viewMode}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">活钱余额（手里的存款）</CardTitle>
                <p className="text-xs text-muted-foreground">
                  日常开销与月供都从这里出。曲线跌破「应急底线」说明开始啃老本；
                  触到零轴后若启用了「月供缺口补足」会转由理财接济。虚线为压力情形。
                </p>
              </CardHeader>
              <CardContent>
                <CashBalanceChart
                  result={result}
                  scenarios={scenarios}
                  startYear={global.startYear}
                  startMonth={global.startMonth}
                  viewMode={viewMode}
                  emergencyReserve={global.emergencyReserve ?? 0}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">贷款余额</CardTitle>
              </CardHeader>
              <CardContent>
                <LoanBalanceChart
                  result={result}
                  scenarios={scenarios}
                  startYear={global.startYear}
                  startMonth={global.startMonth}
                  viewMode={viewMode}
                />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">盈亏平衡分析</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    曲线在零轴之上 = 该方案比不还划算。临界点右侧的收益率区间里，理财比还贷强。
                  </p>
                </CardHeader>
                <CardContent>
                  <BreakevenChart breakeven={result.breakeven} currentReturn={currentReturn} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">累计支出对比</CardTitle>
                </CardHeader>
                <CardContent>
                  <InterestCompareChart result={result} scenarios={scenarios} />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">多方案对比</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <ComparisonTable result={result} scenarios={scenarios} global={global} />
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 pb-8 text-center text-[11px] text-muted-foreground">
          所有数据仅保存在本机浏览器（localStorage），不上传任何服务器。计算结果为简化模型，仅供参考。
          <br />
          开源地址：{' '}
          <a
            href="https://github.com/rccoder/Should-I-PrePay"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            github.com/rccoder/Should-I-PrePay
          </a>
        </footer>
      </main>
    </div>
  )
}

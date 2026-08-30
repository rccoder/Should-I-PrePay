import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useExportImport } from '@/hooks/useExportImport'
import { TimelineEditor } from '@/components/timeline/TimelineEditor'
import { useAnalysis } from '@/hooks/useAnalysis'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoanListEditor } from '@/components/inputs/LoanListEditor'
import {
  ExpenseEditors,
  IncomeSegmentEditor,
  RetirementIncomeEditor,
} from '@/components/inputs/IncomeExpenseEditors'
import {
  CurrentFundsEditor,
  FundIncomeEditor,
  InvestmentEditor,
  MortgagePaymentStrategy,
} from '@/components/inputs/AccountEditors'
import {
  LifeEventEditor,
  InvestmentPlanEditor,
  ScenarioPrepayEditor,
} from '@/components/inputs/EventEditors'
import { GlobalSettingsFields } from '@/components/inputs/GlobalSettingsCard'
import { ComparisonTable } from '@/components/results/ComparisonTable'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { LoanBalanceChart } from '@/components/charts/LoanBalanceChart'
import { LiquidityChart } from '@/components/charts/LiquidityChart'
import { CashBalanceChart } from '@/components/charts/CashBalanceChart'
import { InterestCompareChart } from '@/components/charts/InterestCompareChart'
import { BreakevenChart } from '@/components/charts/BreakevenChart'
export function DashboardPage() {
  const global = useAppStore((s) => s.global)
  const scenarios = useAppStore((s) => s.scenarios)
  const pools = useAppStore((s) => s.pools)
  const resetAll = useAppStore((s) => s.resetAll)
  const result = useAnalysis()
  const { exportJson, pickAndImport } = useExportImport()

  const currentReturn = useMemo(() => {
    const total = pools.reduce((a, p) => a + p.initialBalance, 0)
    if (total <= 0) return 0
    return pools.reduce((a, p) => a + p.expectedAnnualReturn * p.initialBalance, 0) / total
  }, [pools])

  return (
    <div className="min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-full w-full items-center gap-4 px-6">
          <div>
            <h1 className="text-base font-semibold leading-tight">该还不还</h1>
            <p className="text-[11px] text-muted-foreground">人生现金流与提前还款决策分析</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
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

      <main className="w-full px-6 py-4 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
        <div className="grid grid-cols-1 gap-5 lg:h-full lg:grid-cols-[480px_minmax(0,1fr)]">
          {/* 左栏：输入 */}
          <div className="space-y-4 lg:overflow-y-auto lg:pr-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">⓪ 全局设置</CardTitle>
              </CardHeader>
              <CardContent>
                <GlobalSettingsFields maxStressYear={global.startYear + Math.ceil(result.horizonMonths / 12) - 1} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">① 当前资金账户</CardTitle>
              </CardHeader>
              <CardContent>
                <CurrentFundsEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">② 收入</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <section className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-medium">工资收入时间线</p>
                    <IncomeSegmentEditor />
                  </section>
                  <section className="rounded-lg border p-3">
                    <FundIncomeEditor />
                  </section>
                  <section className="rounded-lg border p-3">
                    <RetirementIncomeEditor />
                  </section>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">③ 投资情况</CardTitle>
              </CardHeader>
              <CardContent>
                <InvestmentEditor />
                <InvestmentPlanEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">④ 支出与人生未来预估</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ExpenseEditors />
                  <LifeEventEditor />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">⑤ 贷款情况</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <LoanListEditor />
                  <MortgagePaymentStrategy result={result} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">⑥ 提前还款计划（按方案）</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <section className="rounded-lg border bg-muted/35 px-3 py-2.5">
                  <p className="text-xs font-medium">默认方案怎么读？</p>
                  <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <p><span className="font-medium text-foreground">只做月冲：</span>每月房贷优先从公积金扣，不足部分再从活钱或按你的设置从理财补；不做提前还款。</p>
                    <p><span className="font-medium text-foreground">月冲 + 公积金年冲：</span>每年 12 月月冲后，把公积金账户全部余额提前还房贷。</p>
                    <p><span className="font-medium text-foreground">月冲 + 年冲 + 额外还款：</span>保留公积金年冲，并按设定追加还款。</p>
                  </div>
                </section>
                <ScenarioPrepayEditor />
              </CardContent>
            </Card>
          </div>

          {/* 右侧：图表区 */}
          <div className="space-y-4 lg:overflow-y-auto lg:pr-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">多方案对比</CardTitle><p className="text-xs text-muted-foreground">比较各方案的成本、期末资产变化、流动性、结论与还清时间；期末资产按统一模拟终点比较。</p></CardHeader>
              <CardContent className="overflow-x-auto"><ComparisonTable result={result} scenarios={scenarios} pools={pools} global={global} stress={global.stressDrawdownEnabled === true} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">时间轴 · 关键节点与计划事件</CardTitle><p className="text-xs text-muted-foreground">共同日历在上；每个方案独立显示还款计划、结果转折和风险预警。悬停看原因与时间。</p></CardHeader>
              <CardContent><TimelineEditor horizon={result.horizonMonths} result={result} /></CardContent>
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
                  viewMode={global.stressDrawdownEnabled ? 'stress' : 'expected'}
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
                  viewMode={global.stressDrawdownEnabled ? 'stress' : 'expected'}
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
                  viewMode={global.stressDrawdownEnabled ? 'stress' : 'expected'}
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
                  viewMode={global.stressDrawdownEnabled ? 'stress' : 'expected'}
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
            <footer className="pb-4 text-center text-[11px] text-muted-foreground">
              所有数据仅保存在本机浏览器（localStorage），不上传任何服务器。计算结果为简化模型，仅供参考。
              <br />
              开源地址：{' '}
              <a href="https://github.com/rccoder/Should-I-PrePay" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                github.com/rccoder/Should-I-PrePay
              </a>
            </footer>
          </div>
        </div>
      </main>
    </div>
  )
}

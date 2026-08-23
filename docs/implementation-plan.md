# 该还不还（Should-I-Prepay）——人生现金流与提前还款决策分析器

## Context

很多有存款的人纠结「该不该提前还房贷」——市面工具只算"少付多少利息"，忽略了真实决策的复杂性：利率会变（LPR）、公积金余额被锁定只能还贷、理财有机会成本、收入会有断崖、大额支出会掏空存款。本工具通过**逐月模拟人的一生现金流**，多方案并排对比，直接回答三个问题：

1. 该不该提前还？（得到的无风险省息 vs 失去的理财收益和流动性）
2. 资金链安全吗？（宽心指数 + 压力测试 + 断裂预警）
3. 到底能省多少？（机会成本口径的「真实节省」，而非误导性的名义利息差）

纯静态 SPA，零服务端：所有计算在浏览器内毫秒级全量重算，数据存 localStorage。应用名「该还不还」，项目目录 `/home/rccoder/dev/should-i-prepay`。

## 技术栈（已定）

- Vite + React + TypeScript(strict)，无路由库（单页）
- UI：shadcn/ui + Tailwind CSS，中文界面
- 图表：Recharts（shadcn Charts 同源），配色按 dataviz 规范固定方案色槽（slot1 蓝=基准 / slot2 橙 / slot3 aqua / slot4 黄；状态色红/黄独立仅用于预警）
- 状态：zustand v5 + persist 中间件（key `mortgage-analyzer:v1`）+ zod 校验回退
- 测试：vitest（引擎纯 TS 库，零 React/DOM 依赖）

## 核心设计决策

- **输入按年、引擎按月**：收支用年薪/年额口径，引擎 ÷12 摊入每月逐月模拟；年终奖独立年度事件指定发放月；提前还款/大额事件保留月精度供时间轴拖拽
- **统一事件系统**：提前还款、大额支出（买车/装修/教育）、大额收入（卖房/理赔）、年度定投全部是 discriminated union 的 `SimEvent`，渲染在同一条时间轴上拖拽编辑
- **同一终点 H 对比**：所有方案一律模拟到同一 H = max(贷款还清月, 退休年, 最晚事件月)，先还清的靠理财滚存——这是「真实节省 = 方案期末净资产 − 基准期末净资产」可比的前提
- **双口径节省都展示**：真实节省（净资产差，扣机会成本）+ 名义少付利息，结论卡片解释两者区别
- **双情形模拟**：预期收益情形 + 压力情形（各池收益 = 预期 − 最大亏损%），压力断裂最高级预警
- **断裂策略**：允许现金为负继续模拟（不冻结贷款），保证方案间记账规则一致可对比
- **净资产不含房产市值**（两方案相同不影响差值，UI 注明）

## 领域模型要点

### 输入四板块
1. **贷款列表**（通用化）：预置商贷/公积金模板，可加车贷等；每笔 {本金(剩余), 剩余期限月, 当前执行利率, 等额本息|等额本金, LPR规则[{第N年起±bp}], 可选违约金率}
2. **收支时间线**（年段编辑）：收入段{起止年, 年薪, 年终奖+发放月}支持断崖+退休快捷模板；固定支出多条命名{物业费等}；生活支出{年额+可选通胀2.5%自动递增}
3. **资产账户**：活钱(初始额, 收益≈0)；理财池×N{名称/风险档, 初始额, 预期年化, 最大亏损%, 定投计划}；公积金{初始余额, 年缴存, 缴存年限, 计息率, 到期处理: 躺平/一次性冲抵/取出进理财}
4. **事件集**（每方案不同）：基准方案[0]恒为「完全不提前还款」

### 资金路由（单月流水线顺序，确定性）
① 利率更新(m%12==0, 重算anchor) → ② 收入入账(工资/年终奖/公积金缴存) → ③ 支出扣活钱 → ④ 贷款计划供款(**公积金月冲优先** min(fundBalance, due)，差额现金自付) → ⑤ 大额收入 → ⑥ 大额支出 → ⑦ 提前还款(executed=min(amount, available)，不足记 warning 不硬阻止) → ⑧ 定投(不足部分执行+warning) → ⑨ 各账户收益滚存 → ⑩ 公积金到期政策 → ⑪ 快照+断裂检测(cash<0)

### 提前还款四种重算（正确性核心，设 i=月利率, B'=还款后余额, M=原月供, p=原每月本金）
| 组合 | 算法 |
|---|---|
| 本息+缩期限 | 解 `n' = −ln(1−B'·i/M)/ln(1+i)` → round 取整 → 用整数期反算新月供；护栏：`B'·i ≥ M` 时回退「减月供」+警告 |
| 本息+减月供 | 期限不变，`M' = annuityPayment(B', i, n')` |
| 本金+缩期限 | p 不变，`n' = ceil(B'/p)` |
| 本金+减月供 | 终点不变，`p' = B'/n'` |

违约金 = A×penaltyRate 从来源账户额外扣，不冲本金。

### 宽心指数（0–100）
coverage(m) = liquid(m)/monthlyOutgo(m)，liquid=cash+Σpools（公积金不计）。分段映射：≥36月→80~100，12–36→50~80，6–12→25~50（焦虑区），<6→0~25（危险红）。综合分 = 0.20·当前跑道 + 0.35·最危险时刻(base) + 0.30·压力跑道(stress) + 0.15·断裂惩罚(100−brokeMonths×15)；硬帽：base 断裂 ≤25，仅 stress 断裂 ≤40。

### 盈亏平衡扫描
粗扫 r∈[0%,10%] 步长 0.25%（41次全量模拟，毫秒级）→ 符号相反区间二分12轮 → 报告所有穿越点（f(r)=净资产差不保证单调）；图表标临界点 r* 和当前加权预期收益率位置。

## 项目结构

```
mortgage-analyzer/
├── src/engine/            # ★ 纯 TS 库零 DOM 依赖，vitest 单测
│   ├── types.ts           # 全部领域类型（SimEvent discriminated union）
│   ├── rate.ts loan.ts events.ts accounts.ts simulate.ts
│   ├── metrics.ts score.ts breakeven.ts presets.ts index.ts(runAnalysis)
│   └── __tests__/         # 公式标准案例精确到分 + 性质测试(Σ本金=初始/余额单调/末期归零)
├── src/store/             # zustand 三 slice: inputSlice / scenarioSlice / uiSlice(不持久化)
├── src/hooks/             # useAnalysis(useMemo 重算管线) / useTimelineDrag(rAF合帧) / useExportImport
├── src/components/
│   ├── ui/                # shadcn CLI 生成件
│   ├── fields/            # MoneyInput(元/万元) PercentInput SliderField YearMonthInput
│   ├── inputs/            # LoanListEditor RateRuleEditor IncomeSegmentEditor ExpenseEditors AccountEditors EventListPanel EventFormDialog
│   ├── timeline/          # TimelineEditor TimelineTrack EventMarker(pointer自研) SegmentBar
│   ├── results/           # ScenarioBar MetricTiles PeaceScoreCard VerdictCard WarningsPanel ComparisonTable
│   ├── charts/            # ChartCard chartPrimitives NetWorthChart LoanBalanceChart LiquidityChart InterestCompareChart BreakevenChart CashflowStackChart IncomeExpenseTimelineChart
│   └── layout/            # HeaderBar(情形切换 预期|压力|叠加) SectionCard
└── src/pages/DashboardPage.tsx
```

## 页面布局

左栏 400px sticky（贷款/收入/支出/账户/事件清单五块折叠卡片）｜右侧主区：方案Tabs → 时间轴编辑器(全宽240px, 多轨道) → 每方案 MetricTiles 行(含宽心指数环) → VerdictCard 结论横幅+WarningsPanel → 图表网格2列(净资产演化跨2列核心图 → 贷款余额｜流动性 → 利息对比｜盈亏平衡 → 现金流堆叠｜收支时间线) → ComparisonTable。窄屏上下堆叠。

## 实现里程碑

**M1 引擎+单测**：脚手架(Vite+vitest) → types → rate → loan(+test: 12万/12期/12%手工案例+四种重算闭式解验证) → events 展开(repeat组合) → simulate 流水线(+test: 路由顺序/断裂/公积金到期三政策/同月多事件序) → metrics → score(边界值 c=6/12/36) → breakeven(已知解析解验证) → presets 四模板(不还只理财/公积金冲抵/每年攒多少还多少)

**M2 最小可用UI**：shadcn init + chart-theme → store+persist+zod+默认示例数据(组合贷典型画像) → 五块输入表单 → useAnalysis 接通 → 净资产/贷款余额图 + MetricTiles + ScenarioBar + ComparisonTable

**M3 分析增强**：LiquidityChart(断裂标红/压力虚线) + 利息对比 → PeaceScoreCard + 情形切换 → WarningsPanel 四级预警 + VerdictCard + BreakevenChart

**M4 时间轴与打磨**：TimelineEditor(命中检测→拖拽预览→rAF commit→snap到月) ↔ EventListPanel 双向联动 → 滑块联动补全 → presets 一键套用/退休模板/JSON导出导入/空态/响应式/文案

## 关键坑（实现时必须遵守）

1. 末期尾差：`|balance|<0.005` 置 0 结清，末期实付=余下本金+当期利息，绝不穿负
2. 缩期限 n' 必须 round 整数且 ≥1，用整数期反算新月供；`B'·i≥M` 回退减月供防死循环
3. 公积金 clamp≥0；lumpPrepay 必须排在月冲之后（流水线⑩在④后）
4. 同月先套新利率重算 anchor 再做提前还款重算；每次重算刷新 anchor
5. 同月多事件确定性排序（流水线顺序+同级按 id 稳定序）；同月两次提前还款第二次看到第一次的结果
6. 通胀递增锚定模拟起点年 `(1+g)^yearIndex` 而非段内年，避免平移段边界金额跳变
7. 所有方案统一终点 H；严禁各方案用自己的还清日做终点
8. 等额本金月供递减，展示首月/末月/均值三个口径
9. 无贷款/全零输入不得 NaN/Infinity；未还清 payoffMonth=Infinity 序列化转 null
10. localStorage 版本号+migrate+zod 校验失败回落默认+toast；JSON 导出兜底

## 验证方式

1. `pnpm test`（或 npm test）：引擎单测全绿——公式标准案例精确到分、四种重算与闭式解一致、性质测试、路由顺序断言
2. 手工对账案例：100万商贷30年4.2%等额本息，月供应为 ≈4890.47 元（可用银行计算器核对）；提前还款10万缩期限后的新月供/剩余期数与主流工具交叉核对
3. `pnpm dev` 打开页面走查：默认示例数据出图 → 拖滑块图表毫秒联动 → 时间轴拖事件改时间点 → 刷新页面数据仍在(localStorage) → 切压力情形看断裂预警 → 导出 JSON 再导入还原

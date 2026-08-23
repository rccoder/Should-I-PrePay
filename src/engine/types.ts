/**
 * 该还不还 —— 引擎领域类型（一切模块的根契约）
 *
 * 约定：
 * - 所有金额单位为「元」，利率为小数（0.039 = 3.9%），bp 为基点（-20 = -0.20%）
 * - 收支时间线用绝对年份；事件用相对模拟起点的月序 monthIndex（0-based）
 * - 所有方案一律模拟到同一终点 H，比较才成立（见 docs/implementation-plan.md 坑 7）
 */

export type Id = string;

// ---------------------------------------------------------------------------
// 贷款
// ---------------------------------------------------------------------------

/** 等额本息 annuity ｜ 等额本金 linear */
export type RepaymentMethod = 'annuity' | 'linear';

export type LoanKind = 'commercial' | 'fund' | 'other';

/**
 * 未来利率预期：「第 startAfterYear 年起，执行利率变为 annualRate」，按年生效。
 * 直接填绝对利率而非增减基点——用户心智更简单；多条规则取「生效年份最新的一条」。
 */
export interface RateRule {
  /** 模拟起点起算的第 N 年起生效（0 = 立即） */
  startAfterYear: number;
  /** 该年起的名义执行年利率（小数，如 0.033） */
  annualRate: number;
}

export interface LoanInput {
  id: Id;
  name: string;
  kind: LoanKind;
  /** 当前剩余本金（元） */
  principal: number;
  remainingMonths: number;
  /** 当前执行年利率 */
  currentRate: number;
  method: RepaymentMethod;
  rateRules: RateRule[];
  /** 提前还款违约金比例，如 0.005；缺省无 */
  prepayPenaltyRate?: number;
  /**
   * 放款延迟：从模拟起点起第几个月这笔贷款才生效（0 = 立即，缺省 0）。
   * 用于「2020 年开始模拟、2021 年才买车贷」这类后置贷款；
   * 未放款前不计月供、不计入负债与净资产。
   */
  startDelayMonths?: number;
}

// ---------------------------------------------------------------------------
// 收支时间线（年段，闭区间 [startYear, endYear]）
// ---------------------------------------------------------------------------

export interface IncomeSegment {
  id: Id;
  label?: string;
  startYear: number;
  endYear: number;
  /** 税后到手年薪 */
  annualSalary: number;
  /** 年终奖（0 表示无）；bonusMonth 发放月 1..12 */
  annualBonus: number;
  bonusMonth: number;
}

export interface FixedExpense {
  id: Id;
  /** 物业费 / 车位 / 保险费 … */
  name: string;
  startYear: number;
  endYear: number;
  annualAmount: number;
}

export interface LivingExpense {
  id: Id;
  startYear: number;
  endYear: number;
  annualAmount: number;
}

// ---------------------------------------------------------------------------
// 资产账户
// ---------------------------------------------------------------------------

export interface CashAccount {
  initialBalance: number;
  /** 「初始活钱全部转入低风险理财」目标池；缺省不转 */
  sweepToPoolId?: Id;
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface WealthPool {
  id: Id;
  name: string;
  riskLevel: RiskLevel;
  initialBalance: number;
  /** 预期年化收益率 */
  expectedAnnualReturn: number;
  /** 最大亏损比例（压力测试：收益 = 预期 − maxLossPct），如 0.15 */
  maxLossPct: number;
}

/** 公积金缴存结束时的余额处理 */
export type FundMaturityPolicy =
  | 'hold' // 躺平继续计息
  | 'lumpPrepay' // 一次性冲抵贷款
  | 'withdrawToWealth'; // 取出进理财池

export interface FundAccount {
  initialBalance: number;
  /** 每年缴存额（个人+单位合计） */
  annualContribution: number;
  /** 预计继续缴存年数 */
  contributionYears: number;
  /** 余额计息年利率 */
  interestRate: number;
  maturityPolicy: FundMaturityPolicy;
  /** lumpPrepay 时的还款效果 */
  maturityPrepayEffect: 'shorten-term' | 'reduce-payment';
  /** withdrawToWealth 的目标池 */
  withdrawToPoolId?: Id;
}

// ---------------------------------------------------------------------------
// 统一事件系统（discriminated union）
// ---------------------------------------------------------------------------

/**
 * 重复规则：
 * - everyYears=2 表示每隔 2 年的同一 monthOfYear 触发一次
 * - everyMonths=6 表示每 6 个月触发一次
 * - count 限次数、untilMonth 限终点；均缺省 = 到模拟终点为止
 */
export interface RepeatRule {
  everyYears?: number;
  everyMonths?: number;
  monthOfYear?: number;
  count?: number;
  untilMonth?: number;
}

export type EventSource = 'cash' | 'wealth' | 'fund';

interface EventBase {
  id: Id;
  /** 相对模拟起点的月序，0-based */
  monthIndex: number;
}

/** 提前还款。目标解析优先级：targetLoanId 指定 > targetGroup 组内自动 > 来源约束自动 */
export interface PrepayEvent extends EventBase {
  type: 'prepay';
  amount: number;
  effect: 'shorten-term' | 'reduce-payment';
  /** 精确指定某一笔贷款（含车贷等非房贷） */
  targetLoanId?: Id;
  /**
   * 目标组：'housing' = 把这笔钱当作「还房贷」，由引擎在房贷内部
   * （商贷+公积金贷）自动先还当前利率最高的——组合贷无需拆开配置。
   * 缺省时：公积金来源自动限定房贷；现金/理财来源在全贷款中挑。
   */
  targetGroup?: 'housing';
  source: EventSource;
  wealthPoolId?: Id;
  repeat?: RepeatRule;
}

/** 大额支出：买车/装修/教育/医疗… */
export interface BigExpenseEvent extends EventBase {
  type: 'big-expense';
  label: string;
  amount: number;
  source: EventSource;
  wealthPoolId?: Id;
  repeat?: RepeatRule;
}

/** 大额收入：卖房/理赔/继承… */
export interface BigIncomeEvent extends EventBase {
  type: 'big-income';
  label: string;
  amount: number;
  target: EventSource;
  wealthPoolId?: Id;
  repeat?: RepeatRule;
}

/** 年度定投：每年第 monthOfYear 月向 poolId 投入 amount（monthIndex 定位首个投放年） */
export interface PeriodicInvestEvent extends EventBase {
  type: 'invest';
  monthOfYear: number;
  amount: number;
  poolId: Id;
}

export type SimEvent = PrepayEvent | BigExpenseEvent | BigIncomeEvent | PeriodicInvestEvent;

/**
 * 人生事件 = 对所有方案都相同的大额收支与定投（买车、装修、卖房…）。
 * 方案之间只差「提前还款计划」——这是架构上的关键区分，
 * 避免用户在每个方案里重复填写相同的人生大事。
 */
export type LifeEvent = BigExpenseEvent | BigIncomeEvent | PeriodicInvestEvent;

// ---------------------------------------------------------------------------
// 全局参数与输入
// ---------------------------------------------------------------------------

export interface GlobalParams {
  /** 模拟起点（"现在"） */
  startYear: number;
  startMonth: number;
  endMode: 'auto' | 'custom';
  customEndYear?: number;
  inflationEnabled: boolean;
  /** 默认 0.025；递增锚定模拟起点年 */
  inflationRate: number;
  /** 退休年（领退休金/可取公积金；也是公积金缴存的自然终点） */
  retireYear?: number;
  /** 退休后养老金年收入（快捷模板写入收入段） */
  retirePensionAnnual?: number;
  /**
   * 房贷月供资金策略：true = 优先公积金月冲（默认，数学最优）；
   * false = 月供全部用活钱付，公积金只攒着（仅供对比，几乎总是更亏）。
   * 注意：无论开关与否，公积金都只作用于房贷，绝不碰车贷等其他贷款。
   */
  fundMonthlyOffset: boolean;
  /**
   * 应急活钱底线：始终保留在活钱账户（只能活期），定投与现金类提前还款不会动用它；
   * 生活支出、月供与大额支出可以动用（它们正是「特殊情况」本身）。默认 100_000。
   */
  emergencyReserve: number;
  /**
   * 月供缺口补足来源：公积金月冲+活钱仍不够付月供时，从哪里继续扣。
   * - 'cash-only'：不补，活钱透支记资金断裂（缺省）
   * - 'wealth-proportional'：从全部理财池按余额比例支取
   * - 其他值视为某个理财池 id：只从该池支取
   */
  monthlyTopUpSource: 'cash-only' | 'wealth-proportional' | Id;
}

/** 一个方案 = 公共参数 + 各自的提前还款计划；scenarios[0] 恒为基准「完全不提前还款」 */
export interface ScenarioDef {
  id: Id;
  name: string;
  colorSlot: 1 | 2 | 3 | 4;
  isBaseline: boolean;
  /** 本方案的提前还款计划 */
  events: PrepayEvent[];
}

export interface AnalysisInput {
  global: GlobalParams;
  loans: LoanInput[];
  incomes: IncomeSegment[];
  fixedExpenses: FixedExpense[];
  living: LivingExpense[];
  /** 人生事件：所有方案共享的大额收支与定投 */
  lifeEvents: LifeEvent[];
  cash: CashAccount;
  pools: WealthPool[];
  fund: FundAccount | null;
  scenarios: ScenarioDef[];
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

export interface LoanSnap {
  loanId: Id;
  balance: number;
  scheduledPayment: number;
  monthsLeft: number;
  active: boolean;
  /** 尚未到放款时间（未开始还，也不计入负债） */
  notStarted: boolean;
}

export interface MonthSnap {
  m: number;
  loans: LoanSnap[];
  cash: number;
  pools: Record<Id, number>;
  fundBalance: number;
  cumInterest: number;
  cumPrincipal: number;
  cumTotalPaid: number;
  netWorth: number;
  brokeThisMonth: boolean;
  /**
   * 当月经常性流出（生活+固定+自付月供），供宽心指数的跑道口径使用。
   * 大额支出是一次性存量消耗、提前还款与定投是资产转移，均不计入。
   */
  monthlyOutgo: number;
}

export type WarningKind =
  | 'broken' // 现金透支（资金断裂）
  | 'stress-broken' // 压力情形下断裂
  | 'offset-shortfall' // 公积金月冲不足，差额转现金自付
  | 'monthly-topup' // 月供缺口按策略从理财支取补足
  | 'prepay-shortfall' // 提前还款时资金不足，自动降挡部分执行
  | 'invest-shortfall' // 定投无法维持全额，自动降挡按实际投入
  | 'expense-shortfall'; // 大额支出资金不足，部分执行

export interface Warning {
  m: number;
  kind: WarningKind;
  detail: string;
}

/** 宽心指数明细（score 为 0–100 综合分） */
export interface PeaceScore {
  score: number;
  band: 'stable' | 'comfortable' | 'tense' | 'anxious' | 'danger';
  /** 第 0 月安全跑道（月数） */
  currentCoverage: number;
  /** 预期情形最危险时刻覆盖月数及所在月 */
  worstCoverage: number;
  worstMonth: number;
  /** 压力情形最差覆盖月数 */
  stressWorstCoverage: number;
  /** 预期情形断裂起始月（未断裂为 null） */
  brokeFromBase: number | null;
  brokeMonthsBase: number;
  brokeMonthsStress: number;
}

export interface ScenarioMetrics {
  totalPaid: number;
  totalInterest: number;
  payoffMonthByLoan: Record<Id, number>;
  /** 统一终点 H 处期末净资产 */
  endNetWorth: number;
  /** 真实节省 = 本方案期末净资产 − 基准期末净资产（机会成本口径） */
  realSavingVsBaseline: number;
  /** 名义少付利息（大众口径） */
  nominalInterestSaving: number;
}

export interface ScenarioOutcome {
  scenarioId: Id;
  base: { snaps: MonthSnap[]; warnings: Warning[] };
  stress: { snaps: MonthSnap[]; warnings: Warning[] };
  metrics: ScenarioMetrics;
  score: PeaceScore;
}

export interface BreakevenResult {
  /** 扫描的理财收益率序列（小数） */
  rates: number[];
  /** 对应的真实节省（方案−基准期末净资产差） */
  savings: number[];
  /** f(r)=0 的穿越点，升序 */
  crossings: number[];
}

export interface AnalysisResult {
  /** 统一模拟终点（总月数） */
  horizonMonths: number;
  baselineId: Id;
  outcomes: Record<Id, ScenarioOutcome>;
  breakeven: BreakevenResult;
}

# 该还不还（Should-I-Prepay）

人生现金流与提前还款决策分析器。帮助有存款的人回答「该不该提前还房贷」：还了得到什么、损失什么、资金链安全吗。

## 硬约束

- **纯静态 SPA，零服务端**：无 API、无数据库，所有计算在浏览器内完成，数据存 localStorage，可部署到任意静态托管
- **输入按年、引擎按月**：收支用年薪/年额口径输入，引擎 ÷12 摊入每月逐月模拟；事件保留月精度
- 中文界面；财务数据敏感，绝不引入任何上传/遥测

## 技术栈

Vite + React + TypeScript(strict) ｜ shadcn/ui + Tailwind CSS ｜ Recharts ｜ zustand v5 + persist ｜ zod ｜ vitest

## 常用命令

```bash
pnpm install
pnpm dev        # 开发服务器
pnpm test       # 引擎单测（vitest）
pnpm build      # 产物为纯静态文件
```

## 架构速览

- `src/engine/` — 纯 TS 计算引擎，零 React/DOM 依赖，可独立单测。入口 `runAnalysis(input)`。核心：逐月模拟流水线、统一事件系统（discriminated union）、双情形（预期/压力）、宽心指数、盈亏平衡扫描
- `src/store/` — zustand 三 slice（input / scenario / ui），persist 到 localStorage（key `mortgage-analyzer:v1`），zod 校验失败回落默认
- `src/components/` — ui（shadcn 生成件）/ fields / inputs / timeline（拖拽时间轴）/ results / charts / layout

## 必读文档

- [docs/requirements-and-decisions.md](docs/requirements-and-decisions.md) — 完整需求演化与每个设计决策的 why（改行为前先读）
- [docs/implementation-plan.md](docs/implementation-plan.md) — 实现计划、关键算法（四种提前还款重算公式、资金路由顺序、宽心指数映射）、坑清单

## 工程约定

- 引擎改动必须带单测；公式正确性以「精确到分的手工案例 + 性质测试（Σ本金=初始、余额单调、末期归零）」双重锁定
- 所有方案必须模拟到**同一终点 H** 再比较，严禁各方案用自己的还清日做终点
- 「节省」必须双口径展示：真实节省（期末净资产差）+ 名义少付利息
- 提交信息用中文，结尾加 Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

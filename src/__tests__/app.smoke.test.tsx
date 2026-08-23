// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '@/App'

/**
 * 运行时冒烟测试：整页渲染不崩溃、关键区块出现。
 * localStorage 在 jsdom 中可用，zustand persist 正常工作。
 */
afterEach(() => {
  cleanup()
  // jsdom 的 opaque origin 下 localStorage 可能不可用，persist 会自动降级为内存模式
  try {
    window.localStorage?.clear()
  } catch {
    /* ignore */
  }
})

describe('App 冒烟', () => {
  it('渲染标题与六大输入区块、结论卡与图表卡', () => {
    render(<App />)
    expect(screen.getByText('该还不还')).toBeTruthy()
    for (const title of [
      '① 贷款',
      '② 收入时间线',
      '③ 支出',
      '④ 资产账户',
      '⑤ 人生大事（所有方案共享）',
      '⑥ 提前还款计划（按方案）',
    ]) {
      expect(screen.getByText(title)).toBeTruthy()
    }
    // 结果区
    expect(screen.getByText(/结论 · /)).toBeTruthy()
    expect(screen.getAllByText(/宽心指数/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('预警').length).toBeGreaterThan(0)
    expect(screen.getAllByText('净资产演化').length).toBeGreaterThan(0)
    expect(screen.getAllByText('盈亏平衡分析').length).toBeGreaterThan(0)
    expect(screen.getAllByText('多方案对比').length).toBeGreaterThan(0)
    expect(screen.getAllByText('时间轴 · 关键节点与计划事件').length).toBeGreaterThan(0)
  })

  it('默认示例数据下方案与指标可见', () => {
    render(<App />)
    expect(screen.getAllByText('不提前还款').length).toBeGreaterThan(0)
    expect(screen.getAllByText('公积金一次性冲抵').length).toBeGreaterThan(0)
    expect(screen.getAllByText('累计利息').length).toBeGreaterThan(0)
    expect(screen.getAllByText('真实节省').length).toBeGreaterThan(0)
  })
})

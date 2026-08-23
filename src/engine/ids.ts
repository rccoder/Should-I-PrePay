import type { Id } from './types'

/** 生成本地唯一 id（无外部依赖） */
export function makeId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { executionPlans, ProcessingTaskInsertSchema, processingTasks, scripts } from './schema'

describe('执行控制面 Schema', () => {
  it('使用固定脚本、计划和任务表名', () => {
    expect(getTableName(scripts)).toBe('scripts')
    expect(getTableName(executionPlans)).toBe('execution_plans')
    expect(getTableName(processingTasks)).toBe('processing_tasks')
  })

  it('任务初始状态只能是 queued', () => {
    expect(
      ProcessingTaskInsertSchema.safeParse({ id: crypto.randomUUID(), status: 'queued' }).success,
    ).toBe(true)
    expect(
      ProcessingTaskInsertSchema.safeParse({ id: crypto.randomUUID(), status: 'done' }).success,
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { createLogger, type LogEntry } from './logger'

describe('安全结构化日志', () => {
  it('只保留白名单字段并移除敏感内容', () => {
    const entries: LogEntry[] = []
    const logger = createLogger({ requestId: 'request-1' }, { write: (entry) => entries.push(entry) })

    logger.error('执行失败', {
      taskId: 'task-1',
      LLM_API_KEY: 'secret',
      prompt: '完整 Prompt',
      rawRecord: { name: '张三' },
      objectKey: 'data-analyze/datasets/private.csv',
    })

    const output = JSON.stringify(entries)
    expect(output).toContain('request-1')
    expect(output).toContain('task-1')
    expect(output).not.toContain('secret')
    expect(output).not.toContain('完整 Prompt')
    expect(output).not.toContain('张三')
    expect(output).not.toContain('private.csv')
  })
})

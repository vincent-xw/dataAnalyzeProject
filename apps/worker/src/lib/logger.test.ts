import { describe, expect, it } from 'vitest'

import { createLogger, createSensitiveDebugLogger, type LogEntry } from './logger'

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

  it('保留上传性能定位所需的非敏感统计信息', () => {
    const entries: LogEntry[] = []
    const logger = createLogger({ requestId: 'request-1' }, { write: (entry) => entries.push(entry) })

    logger.info('数据上传阶段完成', {
      category: 'storage', operation: 'asset_upload', stage: 'r2_data_write', fileType: 'xlsx',
      byteSize: 3_000_000, rowCount: 3_000, columnCount: 12, assetCount: 2, status: 201, durationMs: 850,
    })

    expect(entries[0]?.fields).toMatchObject({
      category: 'storage', operation: 'asset_upload', stage: 'r2_data_write', fileType: 'xlsx',
      byteSize: 3_000_000, rowCount: 3_000, columnCount: 12, assetCount: 2, status: 201, durationMs: 850,
    })
  })

  it('敏感诊断仅在本地开发开启，并递归隐藏凭据字段', () => {
    const entries: unknown[] = []
    const logger = createSensitiveDebugLogger({ ENVIRONMENT: 'development', LOG_SENSITIVE_DEBUG: 'true' }, { write: (entry) => entries.push(entry) })
    logger?.info('原始请求', { requirement: '统计张三成绩', token: 'hidden', nested: { apiKey: 'hidden', row: { name: '张三' } } })
    expect(JSON.stringify(entries)).toContain('统计张三成绩')
    expect(JSON.stringify(entries)).toContain('张三')
    expect(JSON.stringify(entries)).not.toContain('hidden')
    expect(createSensitiveDebugLogger({ ENVIRONMENT: 'production', LOG_SENSITIVE_DEBUG: 'true' })).toBeNull()
  })
})

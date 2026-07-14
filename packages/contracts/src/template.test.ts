import { describe, expect, it } from 'vitest'

import { AnalysisTemplateSchema, PromptVersionSchema } from './template'

describe('AnalysisTemplateSchema', () => {
  it('拒绝重复的标准字段名', () => {
    const result = AnalysisTemplateSchema.safeParse({
      id: crypto.randomUUID(),
      name: '销售分析',
      description: '销售数据模板',
      fields: [
        { name: 'salesAmount', type: 'number', description: '销售额', required: true },
        { name: 'salesAmount', type: 'number', description: '重复销售额', required: false },
      ],
      processingPromptVersionId: crypto.randomUUID(),
      reportingPromptVersionId: crypto.randomUUID(),
    })

    expect(result.success).toBe(false)
  })
})

describe('PromptVersionSchema', () => {
  it('只接受 processing 或 reporting 类型', () => {
    const basePrompt = {
      id: crypto.randomUUID(),
      templateId: crypto.randomUUID(),
      version: 1,
      content: '固定分析范围',
      createdAt: new Date().toISOString(),
    }

    expect(PromptVersionSchema.safeParse({ ...basePrompt, type: 'processing' }).success).toBe(true)
    expect(PromptVersionSchema.safeParse({ ...basePrompt, type: 'unknown' }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import type { ScriptMetadata } from '@data-analyze/contracts'

import { buildProcessingContext, PROCESSING_PLATFORM_RULES } from './prompt'

const scriptMetadata: ScriptMetadata = {
  id: 'sales-region-summary',
  version: '1.0.0',
  name: '区域销售汇总',
  description: '按区域汇总',
  inputFields: [{ name: 'region', type: 'string', description: '区域', required: true }],
  outputFields: [{ name: 'region', type: 'string', description: '区域', required: true }],
  parameterSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
}

describe('buildProcessingContext', () => {
  it('构造上下文时只序列化 Schema 和计数', () => {
    const context = buildProcessingContext({
      rowCount: 2,
      columnCount: 2,
      fields: [{ name: 'region', type: 'string', description: '区域', required: true }],
      scripts: [scriptMetadata],
      templatePrompt: '选择完整脚本',
      userRequirement: '按区域汇总',
    })

    const serialized = JSON.stringify(context)
    expect(serialized).not.toContain('华东')
    expect(Object.keys(context.dataset).sort()).toEqual(['columnCount', 'fields', 'rowCount'])
  })

  it('平台规则明确禁止代码生成、组合和字段发明', () => {
    expect(PROCESSING_PLATFORM_RULES).toContain('只能选择一个清单内脚本')
    expect(PROCESSING_PLATFORM_RULES).toContain('不得生成代码')
    expect(PROCESSING_PLATFORM_RULES).toContain('不得组合脚本')
    expect(PROCESSING_PLATFORM_RULES).toContain('不得发明字段或参数')
    expect(PROCESSING_PLATFORM_RULES).toContain('supported:false')
  })
})

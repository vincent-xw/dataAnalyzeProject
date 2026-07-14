import { describe, expect, it } from 'vitest'

import { ScriptDecisionSchema, ScriptMetadataSchema } from './script'

describe('ScriptDecisionSchema', () => {
  it('supported 为 false 时拒绝携带脚本和参数', () => {
    const result = ScriptDecisionSchema.safeParse({
      supported: false,
      scriptId: 'invented-script',
      scriptVersion: '1.0.0',
      parameters: {},
      reason: '当前能力不支持',
      limitations: ['缺少能力'],
    })

    expect(result.success).toBe(false)
  })

  it('支持的决策必须提供精确语义化版本', () => {
    expect(
      ScriptDecisionSchema.safeParse({
        supported: true,
        scriptId: 'sales-region-summary',
        scriptVersion: 'latest',
        parameters: {},
        reason: '满足需求',
        limitations: [],
      }).success,
    ).toBe(false)
  })
})

describe('ScriptMetadataSchema', () => {
  it('元数据只能包含可序列化的参数描述', () => {
    expect(
      ScriptMetadataSchema.safeParse({
        id: 'sales-region-summary',
        version: '1.0.0',
        name: '区域销售汇总',
        description: '按区域汇总销售额',
        inputFields: [],
        outputFields: [],
        parameterSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      }).success,
    ).toBe(true)
  })
})

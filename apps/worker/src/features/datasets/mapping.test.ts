import { describe, expect, it } from 'vitest'

import { validateMapping } from './mapping'

const templateFields = [
  { name: 'salesAmount', type: 'number' as const, description: '销售额', required: true },
  { name: 'region', type: 'string' as const, description: '区域', required: false },
]

describe('validateMapping', () => {
  it('分别报告未知来源、未知目标和缺少的必填字段', () => {
    const result = validateMapping(['销售额'], templateFields, [
      { sourceField: '不存在', targetField: 'unknownTarget' },
    ])

    expect(result).toEqual({
      unknownSources: [{ sourceField: '不存在', targetField: 'unknownTarget' }],
      unknownTargets: [{ sourceField: '不存在', targetField: 'unknownTarget' }],
      missingRequired: ['salesAmount'],
    })
  })
})

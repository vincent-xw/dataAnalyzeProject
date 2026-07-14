import { describe, expect, it } from 'vitest'

import { DatasetInspectionSchema, FieldMappingListSchema } from './dataset'

describe('FieldMappingListSchema', () => {
  it('拒绝两个来源字段映射到同一个标准字段', () => {
    const result = FieldMappingListSchema.safeParse([
      { sourceField: '销售额', targetField: 'salesAmount' },
      { sourceField: '金额', targetField: 'salesAmount' },
    ])

    expect(result.success).toBe(false)
  })

  it('接受来源字段与标准字段一一对应', () => {
    const result = FieldMappingListSchema.safeParse([
      { sourceField: '销售额', targetField: 'salesAmount' },
      { sourceField: '区域', targetField: 'region' },
    ])

    expect(result.success).toBe(true)
  })

  it('拒绝一个来源字段映射到两个标准字段', () => {
    const result = FieldMappingListSchema.safeParse([
      { sourceField: '金额', targetField: 'salesAmount' },
      { sourceField: '金额', targetField: 'refundAmount' },
    ])

    expect(result.success).toBe(false)
  })
})

describe('DatasetInspectionSchema', () => {
  it('拒绝超过十万行的数据集', () => {
    const result = DatasetInspectionSchema.safeParse({
      rowCount: 100_001,
      columnCount: 2,
      sheets: [],
      sourceFields: ['区域', '销售额'],
    })

    expect(result.success).toBe(false)
  })
})

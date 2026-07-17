import { describe, expect, it } from 'vitest'

import { createSuggestedTargets } from './field-mapping'

const fields = [
  { name: 'sales_amount', type: 'number' as const, sourceLabel: '销售金额', required: true },
  { name: 'customer_name', type: 'string' as const, sourceLabel: '客户名称', required: true },
]

describe('createSuggestedTargets', () => {
  it('按原始表头和规范化英文名称预选唯一映射', () => {
    expect(createSuggestedTargets(['销售金额', 'Customer Name'], fields)).toEqual({
      销售金额: 'sales_amount',
      'Customer Name': 'customer_name',
    })
  })

  it('歧义或重复命中时不生成映射', () => {
    expect(createSuggestedTargets(['销售金额', '销售 金额'], [
      { name: 'sales_amount', type: 'number', sourceLabel: '销售金额', required: true },
    ])).toEqual({})
    expect(createSuggestedTargets(['销售金额'], [
      { name: 'sales_amount', type: 'number', sourceLabel: '销售金额', required: true },
      { name: 'gross_sales', type: 'number', sourceLabel: '销售金额', required: false },
    ])).toEqual({})
  })
})

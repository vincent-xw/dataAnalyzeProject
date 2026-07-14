import { describe, expect, it } from 'vitest'

import { ReportConfigSchema } from './index'

describe('ReportConfigSchema', () => {
  it('拒绝未注册组件类型', () => {
    const result = ReportConfigSchema.safeParse({
      title: '销售报表',
      description: '销售概览',
      filters: [],
      widgets: [
        { id: 'x', type: 'custom-html', layout: { x: 0, y: 0, w: 6, h: 4 } },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('接受五类固定组件和三类筛选器', () => {
    const layout = { x: 0, y: 0, w: 6, h: 4 }
    const result = ReportConfigSchema.safeParse({
      title: '销售报表',
      description: '销售概览',
      filters: [
        { id: 'f1', type: 'select', title: '区域', dataset: 'result', field: 'region' },
        { id: 'f2', type: 'multi-select', title: '区域多选', dataset: 'result', field: 'region' },
        { id: 'f3', type: 'date-range', title: '日期', dataset: 'result', field: 'date' },
      ],
      widgets: [
        { id: 'bar', type: 'bar', title: '柱图', dataset: 'result', dimension: 'region', metric: 'amount', layout },
        { id: 'line', type: 'line', title: '折线', dataset: 'result', dimension: 'date', metric: 'amount', layout },
        { id: 'pie', type: 'pie', title: '饼图', dataset: 'result', dimension: 'region', metric: 'amount', layout },
        { id: 'metric', type: 'metric', title: '指标', dataset: 'result', metric: 'amount', aggregation: 'sum', format: 'currency', layout },
        { id: 'table', type: 'table', title: '明细', dataset: 'result', columns: ['region', 'amount'], layout },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('拒绝重复组件 ID', () => {
    const widget = { id: 'same', type: 'table', title: '明细', dataset: 'result', columns: ['region'], layout: { x: 0, y: 0, w: 12, h: 4 } }
    expect(ReportConfigSchema.safeParse({ title: '报表', description: '描述', filters: [], widgets: [widget, widget] }).success).toBe(false)
  })
})

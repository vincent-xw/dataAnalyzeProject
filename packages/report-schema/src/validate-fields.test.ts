import { describe, expect, it } from 'vitest'

import type { ReportConfig } from './index'
import { validateReportReferences } from './validate-fields'

const resultSchema = [
  { name: 'region', type: 'string' as const, description: '区域', required: true },
  { name: 'totalAmount', type: 'number' as const, description: '销售额', required: true },
]

function barReport(metric: string): ReportConfig {
  return {
    title: '销售报表',
    description: '销售概览',
    filters: [],
    widgets: [
      {
        id: 'sales',
        type: 'bar',
        title: '区域销售额',
        dataset: 'result',
        dimension: 'region',
        metric,
        layout: { x: 0, y: 0, w: 6, h: 4 },
      },
    ],
  }
}

describe('validateReportReferences', () => {
  it('拒绝引用结果 Schema 中不存在的指标', () => {
    const issues = validateReportReferences(barReport('missingMetric'), resultSchema, {
      rowCount: 100,
      byteSize: 2048,
    })
    expect(issues).toContainEqual({ code: 'UNKNOWN_FIELD', field: 'missingMetric' })
  })

  it('拒绝非法布局和三类规模超限', () => {
    const invalidLayout = barReport('totalAmount')
    invalidLayout.widgets[0]!.layout = { x: 8, y: 0, w: 6, h: 4 }
    expect(
      validateReportReferences(invalidLayout, resultSchema, { rowCount: 5_001, byteSize: 5 * 1024 * 1024 + 1 }),
    ).toEqual(
      expect.arrayContaining([
        { code: 'INVALID_LAYOUT', widgetId: 'sales' },
        { code: 'REPORT_DATA_SIZE_EXCEEDED' },
        { code: 'CHART_POINT_LIMIT_EXCEEDED', widgetId: 'sales' },
      ]),
    )

    const table: ReportConfig = {
      ...barReport('totalAmount'),
      widgets: [{ id: 'table', type: 'table', title: '表格', dataset: 'result', columns: ['region'], layout: { x: 0, y: 0, w: 12, h: 4 } }],
    }
    expect(
      validateReportReferences(table, resultSchema, { rowCount: 10_001, byteSize: 100 }),
    ).toContainEqual({ code: 'TABLE_ROW_LIMIT_EXCEEDED', widgetId: 'table' })
  })
})

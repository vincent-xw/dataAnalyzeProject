import { describe, expect, it } from 'vitest'

import type { ReportFilter } from '@data-analyze/report-schema'

import { filterReportData } from './filter-data'

const reportRows = [
  { region: '华东', totalAmount: 150, date: '2026-07-01' },
  { region: '华南', totalAmount: 80, date: '2026-07-15' },
]

describe('filterReportData', () => {
  it('多选筛选只保留明确选中的值', () => {
    const regionFilter: ReportFilter = {
      id: 'region',
      type: 'multi-select',
      title: '区域',
      dataset: 'result',
      field: 'region',
    }
    expect(filterReportData(reportRows, regionFilter, ['华东'])).toEqual([
      { region: '华东', totalAmount: 150, date: '2026-07-01' },
    ])
  })

  it('单选和日期范围使用精确值比较', () => {
    const select: ReportFilter = { id: 'region', type: 'select', title: '区域', dataset: 'result', field: 'region' }
    const dateRange: ReportFilter = { id: 'date', type: 'date-range', title: '日期', dataset: 'result', field: 'date' }
    expect(filterReportData(reportRows, select, '华南')).toHaveLength(1)
    expect(filterReportData(reportRows, dateRange, ['2026-07-10', '2026-07-31'])).toEqual([reportRows[1]])
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ReportConfig } from '@data-analyze/report-schema'

import { ReportRenderer } from './ReportRenderer'

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
}))

const config: ReportConfig = {
  title: '区域销售概览',
  description: '固定组件报表',
  filters: [],
  widgets: [
    { id: 'metric', type: 'metric', title: '销售总额', dataset: 'result', metric: 'totalAmount', aggregation: 'sum', format: 'currency', layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'bar', type: 'bar', title: '区域销售额', dataset: 'result', dimension: 'region', metric: 'totalAmount', layout: { x: 0, y: 2, w: 6, h: 4 } },
    { id: 'line', type: 'line', title: '销售趋势', dataset: 'result', dimension: 'region', metric: 'totalAmount', layout: { x: 6, y: 2, w: 6, h: 4 } },
    { id: 'pie', type: 'pie', title: '销售占比', dataset: 'result', dimension: 'region', metric: 'totalAmount', layout: { x: 0, y: 6, w: 6, h: 4 } },
    { id: 'table', type: 'table', title: '销售明细', dataset: 'result', columns: ['region', 'totalAmount'], layout: { x: 0, y: 10, w: 12, h: 4 } },
  ],
}

describe('ReportRenderer', () => {
  it('只渲染 Schema 已注册的五类组件', () => {
    render(<ReportRenderer config={config} data={[{ region: '华东', totalAmount: 150 }]} />)
    expect(screen.getByRole('heading', { name: '区域销售额' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '销售总额' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '销售明细' })).toBeVisible()
    expect(screen.queryByTestId('raw-html')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-grid')).toHaveClass('report-grid')
  })

  it('空数据仍显示组件标题和明确空状态', () => {
    render(<ReportRenderer config={config} data={[]} />)
    expect(screen.getAllByText('暂无数据').length).toBeGreaterThan(0)
  })
})

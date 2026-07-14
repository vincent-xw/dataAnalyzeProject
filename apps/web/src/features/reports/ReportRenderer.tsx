import { useMemo, useState } from 'react'

import type { ReportConfig, ReportWidget } from '@data-analyze/report-schema'

import { DataTable } from './components/DataTable'
import { EChartWidget } from './components/EChartWidget'
import { MetricCard } from './components/MetricCard'
import { ReportFilters } from './components/ReportFilters'
import { applyReportFilters, type FilterValue, type ReportRow } from './filter-data'
import './reports.css'

export function ReportRenderer({ config, data }: { config: ReportConfig; data: ReportRow[] }) {
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({})
  const filteredData = useMemo(
    () => applyReportFilters(data, config.filters, filterValues),
    [config.filters, data, filterValues],
  )

  return (
    <section className="report-root">
      <h2>{config.title}</h2>
      <p>{config.description}</p>
      <ReportFilters filters={config.filters} data={data} values={filterValues} onChange={(id, value) => setFilterValues((current) => ({ ...current, [id]: value }))} />
      <div className="report-grid" data-testid="report-grid">
        {config.widgets.map((widget) => (
          <div key={widget.id} style={{ gridColumn: `${widget.layout.x + 1} / span ${widget.layout.w}`, gridRow: `${widget.layout.y + 1} / span ${widget.layout.h}` }}>
            {renderWidget(widget, filteredData)}
          </div>
        ))}
      </div>
    </section>
  )
}

function renderWidget(widget: ReportWidget, data: ReportRow[]) {
  // 组件类型来自受控联合，但仍使用显式 switch，禁止动态 import、eval 或 HTML 注入。
  switch (widget.type) {
    case 'metric':
      return <MetricCard widget={widget} data={data} />
    case 'table':
      return <DataTable widget={widget} data={data} />
    case 'bar':
    case 'line':
    case 'pie':
      return <EChartWidget widget={widget} data={data} />
  }
}

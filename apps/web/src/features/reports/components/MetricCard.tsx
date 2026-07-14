import type { MetricWidget } from '@data-analyze/report-schema'

import type { ReportRow } from '../filter-data'

export function MetricCard({ widget, data }: { widget: MetricWidget; data: ReportRow[] }) {
  const values = data.map((row) => row[widget.metric])
  let result: number | null = null
  if (widget.aggregation === 'count') {
    result = values.length
  } else if (values.length > 0 && values.every((value) => typeof value === 'number')) {
    const numbers = values as number[]
    if (widget.aggregation === 'sum') result = numbers.reduce((sum, value) => sum + value, 0)
    if (widget.aggregation === 'average') {
      result = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    }
    if (widget.aggregation === 'min') result = Math.min(...numbers)
    if (widget.aggregation === 'max') result = Math.max(...numbers)
  }

  return (
    <article className="report-widget metric-card">
      <h3>{widget.title}</h3>
      {result === null ? <p>暂无数据</p> : <strong>{formatMetric(result, widget.format)}</strong>}
    </article>
  )
}

function formatMetric(value: number, format: MetricWidget['format']) {
  if (format === 'percent') return new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(value)
  if (format === 'currency') {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
  }
  return new Intl.NumberFormat('zh-CN').format(value)
}

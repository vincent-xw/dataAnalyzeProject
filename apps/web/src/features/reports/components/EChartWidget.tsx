import { useEffect, useRef } from 'react'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import type { ChartWidget } from '@data-analyze/report-schema'

import type { ReportRow } from '../filter-data'

use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer])

export function EChartWidget({ widget, data }: { widget: ChartWidget; data: ReportRow[] }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current || data.length === 0) return
    const chart = init(container.current)
    const dimensions = data.map((row) => String(row[widget.dimension]))
    const metrics = data.map((row) => row[widget.metric])
    const option = widget.type === 'pie'
      ? {
          tooltip: { trigger: 'item' },
          series: [{ type: 'pie', data: dimensions.map((name, index) => ({ name, value: metrics[index] })) }],
        }
      : {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: dimensions },
          yAxis: { type: 'value' },
          series: [{ type: widget.type, data: metrics }],
        }
    chart.setOption(option)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [data, widget])

  return (
    <article className="report-widget chart-widget">
      <h3>{widget.title}</h3>
      {data.length === 0 ? <p>暂无数据</p> : <div ref={container} className="chart-canvas" aria-label={widget.title} />}
    </article>
  )
}

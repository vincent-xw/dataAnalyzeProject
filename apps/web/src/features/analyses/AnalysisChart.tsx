import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ChartWidget } from '@data-analyze/report-schema'
export function buildChartOption(widget: ChartWidget, rows: Array<Record<string, unknown>>) {
  const categories: string[] = []; const categorySet = new Set<string>(); const seriesNames: string[] = []; const seriesSet = new Set<string>(); const values = new Map<string, Map<string, number>>()
  const legacyStringMetric = !widget.aggregation && Boolean(widget.metric) && rows.length > 0 && rows.every((row) => !Number.isFinite(Number(row[widget.metric!])))
  rows.forEach((row) => { const category = String(row[widget.dimension] ?? ''); const series = widget.series ? String(row[widget.series] ?? '') : ''; if (!categorySet.has(category)) { categorySet.add(category); categories.push(category) } if (!seriesSet.has(series)) { seriesSet.add(series); seriesNames.push(series) } const current = values.get(series) || new Map<string, number>(); const numeric = widget.metric ? Number(row[widget.metric]) : 0; const increment = widget.aggregation === 'count' || legacyStringMetric ? 1 : Number.isFinite(numeric) ? numeric : 0; current.set(category, (current.get(category) || 0) + increment); values.set(series, current) })
  if (widget.type === 'pie') { const data = categories.map((name) => ({ name, value: seriesNames.reduce((sum, series) => sum + (values.get(series)?.get(name) || 0), 0) })); return { series: [{ type: 'pie', data }] } }
  return { xAxis: { type: 'category', data: categories }, yAxis: { type: 'value' }, series: seriesNames.map((name) => ({ ...(widget.series ? { name } : {}), type: widget.type, data: categories.map((category) => values.get(name)?.get(category) || 0) })) }
}
export function AnalysisChart({ widget, rows }: { widget: ChartWidget; rows: Array<Record<string, unknown>> }) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { if (!ref.current || import.meta.env.MODE === 'test') return; const chart = echarts.init(ref.current); chart.setOption(buildChartOption(widget, rows)); return () => chart.dispose() }, [widget, rows]); return <div data-testid={`chart-${widget.id}`} style={{ height: 320 }} ref={ref} /> }

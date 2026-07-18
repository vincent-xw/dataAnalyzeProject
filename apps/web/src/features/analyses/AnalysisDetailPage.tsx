import { ArrowLeftOutlined, CopyOutlined, CreditCardTwoTone, DatabaseOutlined, HolderOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Collapse, Skeleton, Tag, Table, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type { ReportConfig, ReportWidget } from '@data-analyze/report-schema'

import { apiRequest } from '../../api/client'
import { AnalysisChart } from './AnalysisChart'
import { useAnalysisDisplaySettings } from './analysis-display-settings'

type Detail = { title: string | null; requirement: string; status: 'ready' | 'failed'; failureReason: string | null; config: ReportConfig | null; rows: Array<Record<string, unknown>> }

function groupWidgetIds(widgetIds: string[], chartsPerRow: number) {
  return widgetIds.reduce<string[][]>((groups, widgetId, index) => {
    const row = Math.floor(index / chartsPerRow)
    ;(groups[row] ||= []).push(widgetId)
    return groups
  }, [])
}

export function AnalysisDetailPage() {
  const { analysisId } = useParams()
  const navigate = useNavigate()
  const displaySettings = useAnalysisDisplaySettings()
  const [detail, setDetail] = useState<(Detail & { assets?: Array<{ name: string; role: string }> }) | null>(null)
  const [widgetRows, setWidgetRows] = useState<string[][]>([])
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null)
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({})
  const [refreshTokens, setRefreshTokens] = useState<Record<string, number>>({})

  useEffect(() => {
    if (analysisId) apiRequest<Detail>(`/api/analyses/${analysisId}`).then(setDetail)
  }, [analysisId])

  useEffect(() => {
    if (detail?.config) setWidgetRows(groupWidgetIds(detail.config.widgets.map((widget) => widget.id), displaySettings.chartsPerRow))
  }, [detail?.config, displaySettings.chartsPerRow])

  function resizeRow(rowIndex: number, event: React.PointerEvent<HTMLDivElement>) {
    const startY = event.clientY
    const startHeight = rowHeights[rowIndex] || displaySettings.defaultRowHeight
    const onMove = (moveEvent: PointerEvent) => setRowHeights((current) => ({ ...current, [rowIndex]: Math.max(240, startHeight + moveEvent.clientY - startY) }))
    const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function reorderWidgets(draggedId: string | null, targetId: string) {
    if (!draggedId || draggedId === targetId) return
    setWidgetRows((current) => {
      const next = current.map((row) => [...row])
      const sourceRowIndex = next.findIndex((row) => row.includes(draggedId))
      const targetRowIndex = next.findIndex((row) => row.includes(targetId))
      if (sourceRowIndex < 0 || targetRowIndex < 0) return current
      const sourceIndex = next[sourceRowIndex]!.indexOf(draggedId)
      next[sourceRowIndex]!.splice(sourceIndex, 1)
      const nextTargetRowIndex = next.findIndex((row) => row.includes(targetId))
      if (nextTargetRowIndex < 0 || (nextTargetRowIndex !== sourceRowIndex && next[nextTargetRowIndex]!.length >= 3)) return current
      const targetIndex = next[nextTargetRowIndex]!.indexOf(targetId)
      next[nextTargetRowIndex]!.splice(targetIndex, 0, draggedId)
      return next.filter((row) => row.length)
    })
    setDraggedWidgetId(null)
  }

  if (!detail) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: '30%' }} />

  const reportColumns: NonNullable<TableProps<Record<string, unknown>>['columns']> = detail.rows.length ? Object.keys(detail.rows[0] || {}).map((column) => ({ title: column, dataIndex: column, key: column, render: (value: unknown) => String(value ?? '') })) : []
  const resolvedWidgetRows = widgetRows.map((row) => row.map((id) => detail.config?.widgets.find((widget) => widget.id === id)).filter((widget): widget is ReportWidget => Boolean(widget)))

  return <section className="stack analysis-detail-page">
    <div className="analysis-detail-title-content">
      <p className="eyebrow">分析结果</p>
      <div className="analysis-detail-title-row"><Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate('/analyses')}>返回分析列表</Button><h2>{detail.title || '分析记录'}</h2></div>
      <div className="analysis-requirement"><p>{detail.requirement}</p><Button aria-label="复制分析需求" icon={<CopyOutlined />} type="text" onClick={() => void navigator.clipboard.writeText(detail.requirement)} /></div>
    </div>
    {detail.assets ? <div className="analysis-related-assets"><span className="muted">关联表：</span>{detail.assets.map((asset) => {
      const isPrimary = asset.role === 'primary'
      return <Tag color={isPrimary ? 'blue' : 'gold'} icon={isPrimary ? <DatabaseOutlined /> : <CreditCardTwoTone />} key={`${asset.role}-${asset.name}`}>{isPrimary ? '主表' : '从表'}：{asset.name}</Tag>
    })}</div> : null}
    {detail.status === 'failed' ? <p className="error">{detail.failureReason}</p> : <>
      <Collapse items={[{ key: 'rules', label: '分析规则', children: <pre>{JSON.stringify(detail.config, null, 2)}</pre> }]} />
      <div className="analysis-widget-layout">{resolvedWidgetRows.map((widgets, rowIndex) => <div className={`analysis-widget-row widget-count-${widgets.length}`} key={widgets.map((widget) => widget.id).join('-')} style={{ height: rowHeights[rowIndex] || displaySettings.defaultRowHeight }}>
        {widgets.map((widget) => <div className="panel analysis-widget-panel" draggable key={widget.id} onDragEnd={() => setDraggedWidgetId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDragStart={(event) => { setDraggedWidgetId(widget.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', widget.id) }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); reorderWidgets(event.dataTransfer.getData('text/plain') || draggedWidgetId, widget.id) }}>
          <div className="analysis-widget-header"><span className="analysis-widget-title"><HolderOutlined /> {widget.title}</span>{'dimension' in widget ? <Button aria-label={`刷新${widget.title}`} icon={<ReloadOutlined />} size="small" type="text" onClick={() => setRefreshTokens((current) => ({ ...current, [widget.id]: (current[widget.id] || 0) + 1 }))} /> : null}</div>
          <div className="analysis-widget-content">{'dimension' in widget ? <AnalysisChart refreshToken={refreshTokens[widget.id] || 0} rows={detail.rows} widget={widget} /> : widget.type === 'table' ? <Table columns={reportColumns} dataSource={detail.rows.slice(0, 50)} pagination={false} rowKey={(_, index) => String(index)} scroll={{ x: 'max-content' }} /> : <p>{detail.rows.reduce((sum, row) => sum + Number(row[widget.metric] || 0), 0)}</p>}</div>
        </div>)}<div aria-label="调整行高" className="analysis-row-resize-handle" onPointerDown={(event) => resizeRow(rowIndex, event)} />
      </div>)}</div>
    </>}
  </section>
}

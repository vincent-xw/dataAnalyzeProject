import { Button, Checkbox, Form, Input, Pagination, Select, Skeleton, Space, Spin, Table, Tabs, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiRequest, type AnalysisFailureGuidance, type AnalysisPage, type AnalysisSummary, type DataAsset, type DataAssetPreview } from '../../api/client'

type ApiFailure = { payload?: { message?: string; guidance?: AnalysisFailureGuidance } }
type CreateAnalysisValues = { assetIds?: string[]; primaryAssetId?: string; requirement?: string }

export function AnalysisListPage() {
  const [form] = Form.useForm<CreateAnalysisValues>()
  const [items, setItems] = useState<AnalysisSummary[]>([])
  const [assets, setAssets] = useState<DataAsset[]>([])
  const [previews, setPreviews] = useState<Record<string, DataAssetPreview | null>>({})
  const [error, setError] = useState('')
  const [guidance, setGuidance] = useState<AnalysisFailureGuidance | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('history')
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const watchedAssetIds = Form.useWatch('assetIds', form)
  const selected = Array.isArray(watchedAssetIds) ? watchedAssetIds : []
  const primaryAssetId = Form.useWatch('primaryAssetId', form) || ''

  const loadAssets = () => {
    setLoadingAssets(true)
    return apiRequest<DataAsset[]>('/api/assets')
      .then(setAssets)
      .catch(() => setError('数据表加载失败。'))
      .finally(() => setLoadingAssets(false))
  }

  const loadHistory = () => {
    setLoadingHistory(true)
    return apiRequest<AnalysisPage>(`/api/analyses?page=${historyPage}&pageSize=${historyPageSize}`)
      .then((history) => { setItems(history.items); setHistoryTotal(history.total) })
      .catch(() => setError('分析历史加载失败。'))
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => { void loadAssets() }, [])
  useEffect(() => { void loadHistory() }, [historyPage, historyPageSize, historyRefresh])
  useEffect(() => {
    selected.filter((id) => !(id in previews)).forEach((id) => {
      setPreviews((current) => ({ ...current, [id]: null }))
      apiRequest<DataAssetPreview>(`/api/assets/${id}/preview`).then((preview) => setPreviews((current) => ({ ...current, [id]: preview }))).catch(() => setPreviews((current) => ({ ...current, [id]: { rowCount: 0, rows: [] } })))
    })
  }, [selected, previews])

  function selectAssets(next: string[]) {
    const currentPrimaryAssetId = form.getFieldValue('primaryAssetId')
    form.setFieldsValue({ assetIds: next, primaryAssetId: next.includes(currentPrimaryAssetId || '') ? currentPrimaryAssetId : next[0] || undefined })
  }

  async function create(values: CreateAnalysisValues) {
    const normalizedRequirement = values.requirement?.trim() || ''
    const assetIds = [...new Set(values.assetIds || [])]
    const selectedPrimaryAssetId = assetIds.includes(values.primaryAssetId || '') ? values.primaryAssetId! : assetIds[0] || ''
    if (!normalizedRequirement) {
      setError('请填写分析需求。')
      return
    }
    if (!assetIds.length || !selectedPrimaryAssetId) {
      setError('请至少选择一张数据表，并从中指定主表。')
      return
    }
    setSaving(true)
    setError('')
    setGuidance(null)
    try {
      await apiRequest('/api/analyses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement: normalizedRequirement, assetIds, primaryAssetId: selectedPrimaryAssetId }) })
      form.resetFields()
      setHistoryPage(1)
      setHistoryRefresh((current) => current + 1)
    } catch (caught) {
      const failure = caught as ApiFailure
      setGuidance(failure.payload?.guidance || null)
      setError(failure.payload?.message || '分析创建失败，请检查所选数据表和需求。')
    } finally {
      setSaving(false)
    }
  }

  const createContent = <section className="stack"><div className="page-heading"><div><h2>新建分析</h2><p>选择数据表并描述你的分析目标，系统会生成可查看的数据分析结果。</p></div></div><Form className="panel stack analysis-create-panel" form={form} layout="vertical" onFinish={create}>
    <Form.Item label="选择数据表" required><Spin spinning={loadingAssets}><Form.Item name="assetIds" noStyle rules={[{ required: true, message: '请至少选择一张数据表' }]}><Checkbox.Group onChange={(values) => selectAssets(values as string[])}>{assets.map((asset) => <Checkbox key={asset.id} value={asset.id}>{asset.name}</Checkbox>)}</Checkbox.Group></Form.Item></Spin></Form.Item>
    {selected.map((id) => {
      const preview = previews[id]
      const columns = preview?.rows[0] ? Object.keys(preview.rows[0]) : []
      const previewColumns: NonNullable<TableProps<Record<string, unknown>>['columns']> = columns.map((column) => ({ title: column, dataIndex: column, key: column, render: (value: unknown) => String(value ?? '') }))
      return <div className="preview-table-wrap" key={id}><h4>{assets.find((asset) => asset.id === id)?.name} 数据参考</h4>{preview === null ? <p className="muted">正在加载预览…</p> : preview?.rows.length ? <Table columns={previewColumns} dataSource={preview.rows.slice(0, 10)} pagination={false} rowKey={(_, index) => String(index)} scroll={{ x: 'max-content' }} /> : <p className="muted">预览数据加载失败或为空。</p>}</div>
    })}
    {selected.length ? <Form.Item label="主表" name="primaryAssetId" rules={[{ required: true, message: '请选择主表' }]}><Select options={selected.map((id) => ({ value: id, label: assets.find((asset) => asset.id === id)?.name }))} /></Form.Item> : null}
    <Form.Item label="分析需求" name="requirement" rules={[{ required: true, whitespace: true, message: '请填写分析需求' }]}><Input.TextArea placeholder="例如：按班级展示平均成绩" /></Form.Item>
    <Button type="primary" htmlType="submit" disabled={saving || !primaryAssetId} loading={saving}>创建分析</Button>
    {error && <p className="error">{error}</p>}
    {guidance ? <aside className="panel stack"><h4>{guidance.summary}</h4><p>{guidance.suggestion}</p><Space><Button onClick={() => { form.setFieldValue('requirement', guidance.revisedRequirement); setGuidance(null); setError('') }}>应用建议</Button></Space></aside> : null}
  </Form></section>

  const historyContent = <section className="stack"><div className="page-heading"><div><h2>历史分析</h2><p>查看已创建的数据分析和生成状态。</p></div><Button type="primary" onClick={() => setActiveTab('create')}>新增分析</Button></div>{loadingHistory ? <Skeleton active paragraph={{ rows: 4 }} /> : <><div className="stack">{items.map((item) => {
    const primaryAsset = item.assets?.find((asset) => asset.role === 'primary')
    const isReady = item.status === 'ready'
    return <Link className="panel analysis-history-card" key={item.id} to={`/analyses/${item.id}`}><span className={`analysis-status-mark ${isReady ? 'is-ready' : 'is-failed'}`}>{isReady ? '分析完成' : '生成失败'}</span><div className="analysis-history-card-heading"><h3>{item.title || '分析生成失败'}</h3>{primaryAsset ? <span className="analysis-primary-asset">主表：{primaryAsset.name}</span> : null}</div><p className="analysis-history-description">{item.requirement}</p><p className="muted">{isReady ? '可查看' : item.guidance?.summary || item.failureReason || '生成失败'}</p></Link>
  })}{!items.length && <p className="muted">还没有分析记录。</p>}</div>{historyTotal > historyPageSize ? <Pagination align="end" current={historyPage} pageSize={historyPageSize} showSizeChanger total={historyTotal} onChange={(page, pageSize) => { setHistoryPage(page); setHistoryPageSize(pageSize) }} /> : null}</>}</section>

  return <section className="stack"><div className="page-heading"><div><p className="eyebrow">智能分析</p><h2>数据分析</h2><p>基于已上传的数据资产创建分析，并查看历史结果。</p></div></div><Tabs activeKey={activeTab} items={[{ key: 'history', label: '历史分析', children: historyContent }, { key: 'create', label: '新建分析', children: createContent }]} onChange={setActiveTab} tabPlacement="start" /></section>
}

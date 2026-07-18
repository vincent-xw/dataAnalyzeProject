import { Button, Checkbox, Form, Input, Select, Space, Table, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiRequest, type AnalysisFailureGuidance, type AnalysisSummary, type DataAsset, type DataAssetPreview } from '../../api/client'

type ApiFailure = { payload?: { message?: string; guidance?: AnalysisFailureGuidance } }

export function AnalysisListPage() {
  const [items, setItems] = useState<AnalysisSummary[]>([])
  const [assets, setAssets] = useState<DataAsset[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [previews, setPreviews] = useState<Record<string, DataAssetPreview | null>>({})
  const [primaryAssetId, setPrimaryAssetId] = useState('')
  const [requirement, setRequirement] = useState('')
  const [error, setError] = useState('')
  const [guidance, setGuidance] = useState<AnalysisFailureGuidance | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([apiRequest<AnalysisSummary[]>('/api/analyses'), apiRequest<DataAsset[]>('/api/assets')]).then(([history, tables]) => { setItems(history); setAssets(tables) }).catch(() => setError('分析历史加载失败。'))

  useEffect(() => { load() }, [])
  useEffect(() => {
    selected.filter((id) => !(id in previews)).forEach((id) => {
      setPreviews((current) => ({ ...current, [id]: null }))
      apiRequest<DataAssetPreview>(`/api/assets/${id}/preview`).then((preview) => setPreviews((current) => ({ ...current, [id]: preview }))).catch(() => setPreviews((current) => ({ ...current, [id]: { rowCount: 0, rows: [] } })))
    })
  }, [selected, previews])

  function toggle(id: string) {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      if (!next.includes(primaryAssetId)) setPrimaryAssetId(next[0] || '')
      return next
    })
  }

  async function create() {
    setSaving(true)
    setError('')
    setGuidance(null)
    try {
      await apiRequest('/api/analyses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirement, assetIds: selected, primaryAssetId }) })
      setRequirement('')
      setSelected([])
      setPrimaryAssetId('')
      load()
    } catch (caught) {
      const failure = caught as ApiFailure
      setGuidance(failure.payload?.guidance || null)
      setError(failure.payload?.message || '分析创建失败，请检查所选数据表和需求。')
    } finally {
      setSaving(false)
    }
  }

  return <section className="stack"><h2>数据分析</h2><Form className="panel stack" layout="vertical" onFinish={create}><h3>新建分析</h3>
    <Form.Item label="选择数据表">{assets.map((asset) => <Checkbox key={asset.id} checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)}>{asset.name}</Checkbox>)}</Form.Item>
    {selected.map((id) => {
      const preview = previews[id]
      const columns = preview?.rows[0] ? Object.keys(preview.rows[0]) : []
      const previewColumns: NonNullable<TableProps<Record<string, unknown>>['columns']> = columns.map((column) => ({ title: column, dataIndex: column, key: column, render: (value: unknown) => String(value ?? '') }))
      return <div className="preview-table-wrap" key={id}><h4>{assets.find((asset) => asset.id === id)?.name} 数据参考</h4>{preview === null ? <p className="muted">正在加载预览…</p> : preview?.rows.length ? <Table columns={previewColumns} dataSource={preview.rows.slice(0, 10)} pagination={false} rowKey={(_, index) => String(index)} scroll={{ x: 'max-content' }} /> : <p className="muted">预览数据加载失败或为空。</p>}</div>
    })}
    {selected.length ? <Form.Item label="主表"><Select value={primaryAssetId} onChange={setPrimaryAssetId} options={selected.map((id) => ({ value: id, label: assets.find((asset) => asset.id === id)?.name }))} /></Form.Item> : null}
    <Form.Item label="分析需求" required><Input.TextArea required value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：按班级展示平均成绩" /></Form.Item>
    <Button type="primary" htmlType="submit" disabled={saving || !primaryAssetId} loading={saving}>创建分析</Button>
    {error && <p className="error">{error}</p>}
    {guidance ? <aside className="panel stack"><h4>{guidance.summary}</h4><p>{guidance.suggestion}</p><Space><Button onClick={() => { setRequirement(guidance.revisedRequirement); setGuidance(null); setError('') }}>应用建议</Button></Space></aside> : null}
  </Form><h2>历史分析</h2><div className="stack">{items.map((item) => <Link className="panel" key={item.id} to={`/analyses/${item.id}`}><h3>{item.title || '分析生成失败'}</h3><p>{item.requirement}</p><p className="muted">{item.assets?.map((asset) => `${asset.role === 'primary' ? '主表：' : ''}${asset.name}`).join('、')} · {item.status === 'ready' ? '可查看' : item.guidance?.summary || item.failureReason || '生成失败'}</p></Link>)}{!items.length && <p className="muted">还没有分析记录。</p>}</div></section>
}

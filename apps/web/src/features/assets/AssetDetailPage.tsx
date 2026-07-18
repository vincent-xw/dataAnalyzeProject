import { Button, Form, Input, Space, Table, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiRequest, type DataAsset, type DataAssetPreview } from '../../api/client'

type MetadataForm = { name: string; description: string; tags: string }

export function AssetDetailPage() {
  const { assetId } = useParams()
  const [asset, setAsset] = useState<DataAsset | null>(null)
  const [preview, setPreview] = useState<DataAssetPreview | null>(null)
  const [form, setForm] = useState<MetadataForm>({ name: '', description: '', tags: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (!assetId) return
    Promise.all([apiRequest<DataAsset>(`/api/assets/${assetId}`), apiRequest<DataAssetPreview>(`/api/assets/${assetId}/preview`)])
      .then(([loadedAsset, loadedPreview]) => {
        setAsset(loadedAsset)
        setPreview(loadedPreview)
        setForm({ name: loadedAsset.name, description: loadedAsset.description || '', tags: loadedAsset.tags.join('、') })
      })
      .catch(() => setError('数据资产加载失败，请稍后重试。'))
  }, [assetId])

  async function saveMetadata() {
    if (!assetId) return
    setSaving(true)
    setError('')
    try {
      const updated = await apiRequest<DataAsset>(`/api/assets/${assetId}/metadata`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description || null, tags: form.tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) }),
      })
      setAsset(updated)
    } catch {
      setError('元数据保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  async function suggestMetadata() {
    if (!assetId || !form.description.trim()) {
      setError('请先用一句话说明这份数据来自哪里、何时创建或用于什么场景。')
      return
    }
    setSuggesting(true)
    setError('')
    try {
      const suggestion = await apiRequest<{ name: string; description: string; tags: string[] }>(`/api/assets/${assetId}/metadata-suggestions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: form.description }),
      })
      setForm({ name: suggestion.name, description: suggestion.description, tags: suggestion.tags.join('、') })
    } catch {
      setError('识别信息建议生成失败，请稍后重试。')
    } finally {
      setSuggesting(false)
    }
  }

  if (error && !asset) return <p className="error">{error}</p>
  if (!asset || !preview) return <p>正在载入数据预览…</p>
  const columns = preview.rows.length ? Object.keys(preview.rows[0] || {}) : []
  const previewColumns: NonNullable<TableProps<Record<string, unknown>>['columns']> = columns.map((column) => ({ title: column, dataIndex: column, key: column, render: (value: unknown) => String(value ?? '') }))
  return (
    <section className="stack asset-page">
      <div className="breadcrumb"><Link to="/assets">我的数据</Link><span>/</span><span>{asset.name}</span></div>
      <div className="page-heading"><div><p className="eyebrow">{asset.rowCount} 行</p><h2>{asset.name}</h2><p>{asset.description || '为这份数据添加说明和标签，方便以后快速识别。'}</p></div><span className="status-chip">可用</span></div>
      <div className="asset-detail-layout">
        <div className="panel preview-panel"><div className="section-heading"><div><h3>数据预览</h3><p>仅展示前 {Math.min(50, preview.rows.length)} 行标准化数据。</p></div></div>
          {preview.rows.length ? <div className="preview-table-wrap"><Table columns={previewColumns} dataSource={preview.rows} pagination={false} rowKey={(_, index) => String(index)} scroll={{ x: 'max-content' }} /></div> : <p className="muted">这份数据暂时没有可预览的行。</p>}
        </div>
        <Form className="panel metadata-panel stack" layout="vertical" onFinish={saveMetadata}>
          <div className="section-heading"><div><h3>识别信息</h3><p>仅帮助你识别和筛选数据，不参与运算。</p></div></div>
          <Form.Item label="资产名称" required><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Item>
          <Form.Item label="说明"><Input.TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="例如：王老师在 2026 春季学期为三年二班录入的期中成绩" /></Form.Item>
          <Form.Item label="标签"><Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="例如：王老师、三年二班、2026 春季" /></Form.Item>
          <Space wrap><Button onClick={suggestMetadata} loading={suggesting}>智能整理识别信息</Button><Button type="primary" htmlType="submit" loading={saving}>保存元数据</Button></Space>
          {error ? <p className="error">{error}</p> : null}
        </Form>
      </div>
    </section>
  )
}

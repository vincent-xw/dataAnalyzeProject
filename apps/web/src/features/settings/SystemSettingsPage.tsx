import { Button, Form, Input, InputNumber, Select, Space } from 'antd'
import { useEffect, useState } from 'react'

import { apiRequest } from '../../api/client'
import { updateAnalysisDisplaySettings, useAnalysisDisplaySettings } from '../analyses/analysis-display-settings'

type Prompt = { id: string; version: number; source: 'default' | 'manual'; content: string; createdAt: string }

export function SystemSettingsPage() {
  const [current, setCurrent] = useState<Prompt | null>(null)
  const [versions, setVersions] = useState<Prompt[]>([])
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const displaySettings = useAnalysisDisplaySettings()
  const load = () => Promise.all([apiRequest<Prompt>('/api/settings/analysis-prompt'), apiRequest<Prompt[]>('/api/settings/analysis-prompt/versions')]).then(([active, history]) => { setCurrent(active); setContent(active.content); setVersions(history) }).catch(() => setError('系统设置加载失败。'))

  useEffect(() => { load() }, [])

  async function save() {
    try { await apiRequest('/api/settings/analysis-prompt', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }); load() } catch { setError('提示词保存失败。') }
  }

  async function restore() { await apiRequest('/api/settings/analysis-prompt/restore-default', { method: 'POST' }); load() }
  async function activate(id: string) { await apiRequest(`/api/settings/analysis-prompt/versions/${id}/activate`, { method: 'POST' }); load() }
  async function saveDisplaySettings(next: typeof displaySettings) { try { await updateAnalysisDisplaySettings(next) } catch { setError('图表展示配置保存失败。') } }

  return <section className="stack"><div className="page-heading"><div><p className="eyebrow">系统配置</p><h2>系统设置</h2><p>管理分析规则提示词及其历史版本。</p></div></div><Form className="panel stack" layout="vertical" onFinish={save}><h3>分析规则提示词</h3><p className="muted">当前版本：v{current?.version} · {current?.source === 'default' ? '默认' : '人工微调'}</p><Form.Item label="分析规则提示词"><Input.TextArea value={content} onChange={(event) => setContent(event.target.value)} rows={18} /></Form.Item><Space wrap><Button type="primary" htmlType="submit">保存为新版本</Button><Button onClick={restore}>恢复默认提示词</Button></Space>{error && <p className="error">{error}</p>}</Form><div className="panel stack"><h3>图表展示</h3><p className="muted">配置会保存到系统，并应用于后续进入的分析详情。</p><Form layout="vertical"><Form.Item label="每行默认图表数"><Select value={displaySettings.chartsPerRow} onChange={(chartsPerRow: 1 | 2 | 3) => { void saveDisplaySettings({ ...displaySettings, chartsPerRow }) }} options={[{ value: 1, label: '1 个' }, { value: 2, label: '2 个' }, { value: 3, label: '3 个' }]} /></Form.Item><Form.Item label="图表区域默认高度"><InputNumber min={240} max={800} step={20} suffix="px" value={displaySettings.defaultRowHeight} onChange={(defaultRowHeight) => { if (typeof defaultRowHeight === 'number') void saveDisplaySettings({ ...displaySettings, defaultRowHeight }) }} /></Form.Item></Form></div><div className="panel stack"><h3>版本历史</h3>{versions.map((version) => <div key={version.id}><span>v{version.version} · {version.source === 'default' ? '默认' : '人工'}</span>{version.id !== current?.id ? <Button type="link" onClick={() => activate(version.id)}>切换到此版本</Button> : <span className="muted">当前生效</span>}</div>)}</div></section>
}

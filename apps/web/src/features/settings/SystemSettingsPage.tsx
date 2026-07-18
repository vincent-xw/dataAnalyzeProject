import { Button, Form, Input, Space } from 'antd'
import { useEffect, useState } from 'react'

import { apiRequest } from '../../api/client'

type Prompt = { id: string; version: number; source: 'default' | 'manual'; content: string; createdAt: string }

export function SystemSettingsPage() {
  const [current, setCurrent] = useState<Prompt | null>(null)
  const [versions, setVersions] = useState<Prompt[]>([])
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const load = () => Promise.all([apiRequest<Prompt>('/api/settings/analysis-prompt'), apiRequest<Prompt[]>('/api/settings/analysis-prompt/versions')]).then(([active, history]) => { setCurrent(active); setContent(active.content); setVersions(history) }).catch(() => setError('系统设置加载失败。'))

  useEffect(() => { load() }, [])

  async function save() {
    try { await apiRequest('/api/settings/analysis-prompt', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }); load() } catch { setError('提示词保存失败。') }
  }

  async function restore() { await apiRequest('/api/settings/analysis-prompt/restore-default', { method: 'POST' }); load() }
  async function activate(id: string) { await apiRequest(`/api/settings/analysis-prompt/versions/${id}/activate`, { method: 'POST' }); load() }

  return <section className="stack"><h2>系统设置</h2><Form className="panel stack" layout="vertical" onFinish={save}><h3>分析规则提示词</h3><p className="muted">当前版本：v{current?.version} · {current?.source === 'default' ? '默认' : '人工微调'}</p><Form.Item label="分析规则提示词"><Input.TextArea value={content} onChange={(event) => setContent(event.target.value)} rows={18} /></Form.Item><Space wrap><Button type="primary" htmlType="submit">保存为新版本</Button><Button onClick={restore}>恢复默认提示词</Button></Space>{error && <p className="error">{error}</p>}</Form><div className="panel stack"><h3>版本历史</h3>{versions.map((version) => <div key={version.id}><span>v{version.version} · {version.source === 'default' ? '默认' : '人工'}</span>{version.id !== current?.id ? <Button type="link" onClick={() => activate(version.id)}>切换到此版本</Button> : <span className="muted">当前生效</span>}</div>)}</div></section>
}

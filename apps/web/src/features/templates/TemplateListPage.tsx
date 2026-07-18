import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { FieldDefinition } from '@data-analyze/contracts'

import { ApiError, apiRequest } from '../../api/client'

type TemplateSummary = {
  id: string
  name: string
  description: string
  fields: FieldDefinition[]
}
export function TemplateListPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<TemplateSummary[]>('/api/templates')
      .then((items) => {
        if (active) setTemplates(items)
      })
      .catch(() => {
        if (active) setError('模板列表加载失败')
      })
    return () => {
      active = false
    }
  }, [])

  async function removeTemplate(template: TemplateSummary) {
    if (!window.confirm(`确认删除模板“${template.name}”吗？`)) return
    setError('')
    try {
      await apiRequest(`/api/templates/${template.id}`, { method: 'DELETE' })
      setTemplates((current) => current.filter((item) => item.id !== template.id))
    } catch (reason) {
      setError(getApiErrorMessage(reason, '模板删除失败'))
    }
  }

  return (
    <section className="panel stack">
      <div className="row">
        <h2>分析模板</h2>
        <Link to="/templates/new">新建模板</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {templates.length === 0 && !error ? <p>暂无模板</p> : null}
      {templates.map((template) => (
        <article key={template.id}>
          <h3>{template.name}</h3>
          <p>{template.description}</p>
          <small>{template.fields.length} 个标准字段</small>
          <div className="row">
            <Link to={`/templates/${template.id}`}>预览</Link>
            <Link to={`/templates/${template.id}/edit`}>编辑</Link>
            <button type="button" onClick={() => void removeTemplate(template)}>删除</button>
          </div>
        </article>
      ))}
    </section>
  )
}

function getApiErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.payload && typeof reason.payload === 'object' && 'message' in reason.payload) {
    return String(reason.payload.message)
  }
  return fallback
}

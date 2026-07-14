import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { FieldDefinition } from '@data-analyze/contracts'

import { apiRequest } from '../../api/client'

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
        </article>
      ))}
    </section>
  )
}

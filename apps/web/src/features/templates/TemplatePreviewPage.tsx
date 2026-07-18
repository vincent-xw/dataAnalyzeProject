import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { FieldDefinition } from '@data-analyze/contracts'

import { ApiError, apiRequest } from '../../api/client'

type Prompt = { version: number; content: string }
type TemplateDetail = {
  id: string
  name: string
  description: string
  fields: FieldDefinition[]
  processingPrompt: Prompt
  reportingPrompt: Prompt
}

export function TemplatePreviewPage() {
  const { templateId } = useParams()
  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!templateId) return
    let active = true
    apiRequest<TemplateDetail>(`/api/templates/${templateId}`)
      .then((loadedTemplate) => {
        if (active) setTemplate(loadedTemplate)
      })
      .catch((reason) => {
        if (active) setError(getApiErrorMessage(reason, '模板详情加载失败'))
      })
    return () => {
      active = false
    }
  }, [templateId])

  if (error) return <p className="error">{error}</p>
  if (!template) return <p>正在载入模板…</p>

  return (
    <section className="panel stack">
      <div className="row">
        <h2>{template.name}</h2>
        <Link to={`/templates/${template.id}/edit`}>编辑模板</Link>
      </div>
      <p>{template.description}</p>
      <section className="stack">
        <h3>标准字段</h3>
        <table>
          <thead><tr><th>字段名称</th><th>原表头</th><th>类型</th><th>必填</th></tr></thead>
          <tbody>{template.fields.map((field) => (
            <tr key={field.name}>
              <td>{field.name}</td><td>{field.sourceLabel}</td><td>{field.type}</td><td>{field.required ? '是' : '否'}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="stack">
        <h3>数据加工预设 Prompt（第 {template.processingPrompt.version} 版）</h3>
        <pre>{template.processingPrompt.content}</pre>
      </section>
      <section className="stack">
        <h3>报表预设 Prompt（第 {template.reportingPrompt.version} 版）</h3>
        <pre>{template.reportingPrompt.content}</pre>
      </section>
    </section>
  )
}

function getApiErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.payload && typeof reason.payload === 'object' && 'message' in reason.payload) {
    return String(reason.payload.message)
  }
  return fallback
}

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type { ReportConfig } from '@data-analyze/report-schema'

import { ApiError, apiRequest } from '../../api/client'
import { ReportRenderer } from './ReportRenderer'
import type { ReportRow } from './filter-data'

type ReportContext = {
  taskId: string
  templateId: string
  templateName: string
  reportingPromptVersionId: string
  reportingPrompt: string
}

type Draft = {
  id: string
  validationStatus: 'valid' | 'invalid'
  config: ReportConfig
}

type Props = {
  taskId: string
  onPublished?: (reportVersionId: string) => void
}

function ReportEditorContent({ taskId, onPublished }: Props) {
  const [context, setContext] = useState<ReportContext | null>(null)
  const [prompt, setPrompt] = useState('')
  const [requirement, setRequirement] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [data, setData] = useState<ReportRow[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiRequest<ReportContext>(`/api/tasks/${taskId}/report-context`)
      .then((value) => {
        setContext(value)
        setPrompt(value.reportingPrompt)
      })
      .catch((reason) => setError(formatApiError(reason, '报表上下文加载失败')))
  }, [taskId])

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!context) return
    setSubmitting(true)
    setError('')
    setDraft(null)
    try {
      let promptVersionId = context.reportingPromptVersionId
      if (prompt !== context.reportingPrompt) {
        const version = await apiRequest<{ id: string }>(
          `/api/templates/${context.templateId}/prompts`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'reporting', content: prompt }),
          },
        )
        promptVersionId = version.id
      }
      const created = await apiRequest<Draft>(`/api/tasks/${taskId}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promptVersionId, userRequirement: requirement }),
      })
      const rows = await apiRequest<ReportRow[]>(`/api/report-versions/${created.id}/data`)
      setDraft(created)
      setData(rows)
    } catch (reason) {
      setError(formatApiError(reason, '报表预览生成失败'))
    } finally {
      setSubmitting(false)
    }
  }

  async function publish() {
    if (!draft || draft.validationStatus !== 'valid') return
    setError('')
    try {
      await apiRequest(`/api/report-versions/${draft.id}/confirm`, { method: 'POST' })
      onPublished?.(draft.id)
    } catch (reason) {
      setError(formatApiError(reason, '报表发布失败'))
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h2>创建报表{context ? `：${context.templateName}` : ''}</h2>
        <p>模型只接收结果字段 Schema、固定组件协议和以下文字，不接收实际结果值。</p>
        <form onSubmit={generate}>
          <label>报表模板 Prompt<textarea required value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
          <label>本次展示需求<textarea required value={requirement} onChange={(event) => setRequirement(event.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={!context || submitting}>{submitting ? '正在生成…' : '生成预览'}</button>
        </form>
      </div>
      {draft ? (
        <div className="stack">
          <ReportRenderer config={draft.config} data={data} />
          {draft.validationStatus === 'valid' ? <button type="button" onClick={publish}>确认发布</button> : null}
        </div>
      ) : null}
    </section>
  )
}

function RoutedReportEditorPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  if (!taskId) return <p className="error">缺少任务 ID</p>
  return <ReportEditorContent taskId={taskId} onPublished={(id) => navigate(`/reports/${id}`)} />
}

export function ReportEditorPage(props: Props | Record<string, never>) {
  return hasEditorProps(props) ? <ReportEditorContent {...props} /> : <RoutedReportEditorPage />
}

function hasEditorProps(props: Props | Record<string, never>): props is Props {
  return 'taskId' in props
}

function formatApiError(reason: unknown, message: string) {
  if (reason instanceof ApiError && reason.payload && typeof reason.payload === 'object' && 'code' in reason.payload) {
    return `${String(reason.payload.code)}：${message}`
  }
  return message
}

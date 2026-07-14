import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { apiRequest } from '../../api/client'

type AnalysisContext = {
  datasetVersionId: string
  templateId: string
  templateName: string
  processingPromptVersionId: string
  processingPrompt: string
}

export function AnalysisRequestPage() {
  const { versionId } = useParams()
  const navigate = useNavigate()
  const [context, setContext] = useState<AnalysisContext | null>(null)
  const [prompt, setPrompt] = useState('')
  const [requirement, setRequirement] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!versionId) return
    apiRequest<AnalysisContext>(`/api/dataset-versions/${versionId}/analysis-context`)
      .then((value) => {
        setContext(value)
        setPrompt(value.processingPrompt)
      })
      .catch(() => setError('分析上下文加载失败'))
  }, [versionId])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!context || !versionId) return
    setSubmitting(true)
    setError('')
    try {
      let promptVersionId = context.processingPromptVersionId
      if (prompt !== context.processingPrompt) {
        const version = await apiRequest<{ id: string }>(
          `/api/templates/${context.templateId}/prompts`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'processing', content: prompt }),
          },
        )
        promptVersionId = version.id
      }
      const plan = await apiRequest<{ id: string }>(
        `/api/dataset-versions/${versionId}/plans`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ promptVersionId, userRequirement: requirement }),
        },
      )
      navigate(`/plans/${plan.id}`)
    } catch {
      setError('脚本推荐失败，请检查 Prompt 与本次需求')
    } finally {
      setSubmitting(false)
    }
  }

  if (!context && !error) return <p>正在加载分析上下文…</p>

  return (
    <section className="panel stack">
      <h2>发起数据加工{context ? `：${context.templateName}` : ''}</h2>
      <p>模型只接收字段结构、行列数、脚本清单和以下文字，不接收实际数据行。</p>
      <form onSubmit={submit}>
        <label>
          模板加工 Prompt
          <textarea required value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <label>
          本次客制化加工需求
          <textarea required value={requirement} onChange={(event) => setRequirement(event.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={!context || submitting}>
          {submitting ? '正在推荐…' : '获取脚本推荐'}
        </button>
      </form>
    </section>
  )
}

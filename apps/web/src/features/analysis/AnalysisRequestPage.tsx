import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { apiRequest } from '../../api/client'

type AnalysisContext = {
  datasetVersionId: string
  templateId: string
  templateName: string
  processingPromptVersionId: string
  processingPrompt: string
  fields: Array<{
    sourceLabel: string
    name: string
    type: 'string' | 'number' | 'boolean' | 'date'
  }>
}

export function AnalysisRequestPage() {
  const { versionId } = useParams()
  const navigate = useNavigate()
  const [context, setContext] = useState<AnalysisContext | null>(null)
  const [prompt, setPrompt] = useState('')
  const [requirement, setRequirement] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState<{ id: string; version: string; source: string; rationale: string } | null>(null)
  const [creatingPullRequest, setCreatingPullRequest] = useState(false)

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

  async function generateDraft() {
    if (!context || !versionId || !requirement.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const value = await apiRequest<{ id: string; version: string; source: string; rationale: string }>(
        '/internal/scripts/drafts',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ datasetVersionId: versionId, requirement }),
        },
      )
      setDraft(value)
    } catch {
      setError('候选代码生成失败，请检查需求与字段映射')
    } finally {
      setSubmitting(false)
    }
  }

  async function createCandidatePullRequest() {
    if (!draft) return
    setCreatingPullRequest(true)
    setError('')
    try {
      const result = await apiRequest<{ pullRequestUrl: string }>('/internal/scripts/candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: draft.id, version: draft.version, source: draft.source }),
      })
      window.open(result.pullRequestUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setError('候选 PR 创建失败')
    } finally {
      setCreatingPullRequest(false)
    }
  }

  if (!context && !error) return <p>正在加载分析上下文…</p>

  return (
    <section className="panel stack">
      <h2>发起数据加工{context ? `：${context.templateName}` : ''}</h2>
      <p>模型只接收字段结构、行列数、脚本清单和以下文字，不接收实际数据行。</p>
      {context ? <section aria-label="已选字段" className="stack">
        <h3>本次已选字段</h3>
        <ul>
          {context.fields.map((field) => (
            <li key={field.name}>{field.sourceLabel} → {field.name}（{field.type}）</li>
          ))}
        </ul>
      </section> : null}
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
        <button type="button" disabled={!context || submitting || !requirement.trim()} onClick={generateDraft}>
          {submitting ? '正在生成…' : '生成候选代码'}
        </button>
      </form>
      {draft ? <section className="stack" aria-label="候选代码预览">
        <h3>候选代码预览：{draft.id}@{draft.version}</h3>
        <p>{draft.rationale}</p>
        <pre><code>{draft.source}</code></pre>
        <button type="button" disabled={creatingPullRequest} onClick={createCandidatePullRequest}>
          {creatingPullRequest ? '正在创建 PR…' : '创建候选 PR'}
        </button>
      </section> : null}
    </section>
  )
}

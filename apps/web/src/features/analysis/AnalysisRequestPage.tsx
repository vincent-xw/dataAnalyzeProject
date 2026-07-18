import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ApiError, apiRequest } from '../../api/client'

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
  scripts: Array<{
    id: string
    version: string
    name: string
    description: string
    inputFields: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'date' }>
    outputFields: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'date' }>
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
  const [savingCandidate, setSavingCandidate] = useState(false)

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

  /** 用户直接选定精确脚本时，仅创建待确认计划，不触发 LLM 推荐。 */
  async function selectScript(scriptId: string, scriptVersion: string) {
    if (!context || !versionId) return
    setSubmitting(true)
    setError('')
    try {
      const plan = await apiRequest<{ id: string }>(
        `/api/dataset-versions/${versionId}/plans/selected`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            promptVersionId: context.processingPromptVersionId,
            scriptId,
            scriptVersion,
          }),
        },
      )
      navigate(`/plans/${plan.id}`)
    } catch {
      setError('所选脚本无法用于当前字段，请检查脚本输入要求')
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
    } catch (reason) {
      setError(formatCandidateGenerationError(reason))
    } finally {
      setSubmitting(false)
    }
  }

  async function saveCandidateDraft() {
    if (!draft) return
    setSavingCandidate(true)
    setError('')
    try {
      await apiRequest<{ id: string; objectKey: string }>('/internal/scripts/candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: draft.id, version: draft.version, source: draft.source }),
      })
    } catch {
      setError('候选源码保存失败')
    } finally {
      setSavingCandidate(false)
    }
  }

  if (!context && !error) return <p>正在加载分析上下文…</p>

  return (
    <section className="panel stack">
      <h2>发起数据加工{context ? `：${context.templateName}` : ''}</h2>
      <p>基础数据已在字段映射后自动生成。以下操作仅用于需要额外加工的场景。</p>
      {context ? <section aria-label="已选字段" className="stack">
        <h3>本次已选字段</h3>
        <ul>
          {context.fields.map((field) => (
            <li key={field.name}>{field.sourceLabel} → {field.name}（{field.type}）</li>
          ))}
        </ul>
      </section> : null}
      <section className="stack" aria-label="已启用脚本">
        <h3>已启用脚本</h3>
        {context?.scripts.length === 0 ? <p>暂无可直接选择的脚本，可使用智能推荐或生成候选代码。</p> : null}
        {context?.scripts.map((script) => (
          <article key={`${script.id}@${script.version}`} className="panel stack">
            <h4>{script.name}</h4>
            <p>{script.description}</p>
            <small>输入：{script.inputFields.map((field) => `${field.name}:${field.type}`).join('、')}</small>
            <small>输出：{script.outputFields.map((field) => `${field.name}:${field.type}`).join('、')}</small>
            <button type="button" disabled={submitting} onClick={() => selectScript(script.id, script.version)}>
              选择{script.name}
            </button>
          </article>
        ))}
      </section>
      <form onSubmit={submit}>
        <h3>智能推荐或生成候选代码</h3>
        <p>仅当现有脚本不能满足需求时填写；模型不会读取实际数据行。</p>
        <label>
          模板加工 Prompt
          <textarea required value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <label>
          本次客制化加工需求（仅智能推荐或生成候选代码时填写）
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
        <button type="button" disabled={savingCandidate} onClick={saveCandidateDraft}>
          {savingCandidate ? '正在保存…' : '保存候选源码到 R2'}
        </button>
      </section> : null}
    </section>
  )
}

/** 只展示后端已经脱敏的错误码和请求关联 ID，不回显模型或用户输入。 */
function formatCandidateGenerationError(reason: unknown) {
  if (!(reason instanceof ApiError) || !reason.payload || typeof reason.payload !== 'object' || Array.isArray(reason.payload)) {
    return '候选代码生成失败，请检查需求与字段映射'
  }
  const payload = reason.payload
  const code = typeof payload.code === 'string' ? payload.code : null
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
  if (!code) return '候选代码生成失败，请检查需求与字段映射'
  return `${code}：候选代码生成失败${requestId ? `（请求 ID：${requestId}）` : ''}`
}

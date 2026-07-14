import { useState, type FormEvent } from 'react'

import { apiRequest } from '../../api/client'

type CandidateResponse = {
  branch: string
  pullRequestUrl: string
  status: 'awaiting_ci'
}

/** 隐藏管理页仅提交候选 PR，不提供自动合并或直接部署入口。 */
export function ScriptUploadPage() {
  const [id, setId] = useState('')
  const [version, setVersion] = useState('')
  const [source, setSource] = useState('')
  const [result, setResult] = useState<CandidateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const targetPath = id && version ? `packages/scripts/src/${id}/${version}.ts` : ''

  /** 文件内容保持原样预览和上传，不对 metadata 字段做任何前端兜底或改写。 */
  async function readSource(file: File | undefined) {
    if (!file) return
    setSource(await file.text())
    setResult(null)
  }

  async function submitCandidate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      setResult(await apiRequest<CandidateResponse>('/internal/scripts/candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, version, source }),
      }))
    } catch {
      setError('候选脚本提交失败，请检查源码和仓库配置')
    }
  }

  return (
    <section>
      <h2>候选脚本上传</h2>
      <p>脚本只会创建 Pull Request，需通过 CI 并人工审核后才能上线。</p>
      <form onSubmit={submitCandidate}>
        <label>
          脚本 ID
          <input value={id} onChange={(event) => setId(event.target.value)} required />
        </label>
        <label>
          版本
          <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" required />
        </label>
        <label>
          TypeScript 源码
          <input type="file" accept=".ts,text/typescript" onChange={(event) => void readSource(event.target.files?.[0])} />
        </label>
        {targetPath && <p>目标路径：<strong>{targetPath}</strong></p>}
        {source && <pre><code>{source}</code></pre>}
        <button type="submit" disabled={!id || !version || !source}>创建候选 PR</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p>
          候选分支 {result.branch} 已创建，
          <a href={result.pullRequestUrl} target="_blank" rel="noreferrer">查看 Pull Request</a>
        </p>
      )}
    </section>
  )
}

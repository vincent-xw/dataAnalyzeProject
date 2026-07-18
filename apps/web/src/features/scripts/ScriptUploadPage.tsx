import { useState, type FormEvent } from 'react'

import { apiRequest } from '../../api/client'

type CandidateResponse = {
  id: string
  objectKey: string
  status: 'stored'
}

/** 候选源码只写入 R2 草稿区，Worker 不会动态执行任意 TypeScript。 */
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
      setError('候选脚本保存失败，请检查源码和网络配置')
    }
  }

  return (
    <section>
      <h2>候选脚本上传</h2>
      <p>候选源码会直接保存到 R2 草稿区，不创建 Pull Request，也不会自动执行。</p>
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
        <button type="submit" disabled={!id || !version || !source}>保存候选源码</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p>
          候选源码已保存：<code>{result.objectKey}</code>
        </p>
      )}
    </section>
  )
}

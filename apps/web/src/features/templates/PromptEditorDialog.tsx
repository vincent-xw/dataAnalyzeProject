import { useEffect, useState } from 'react'

type Props = {
  title: string
  value: string
  onSave: (value: string) => void
  onClose: () => void
}

/** 在提交到模板前提供更大的 Prompt 编辑空间，取消时不修改页面表单状态。 */
export function PromptEditorDialog({ title, value, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  return (
    <div className="prompt-dialog-backdrop" role="presentation">
      <section className="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-dialog-title">
        <header className="row">
          <h2 id="prompt-dialog-title">编辑{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭编辑">关闭</button>
        </header>
        <label className="prompt-dialog-editor">
          {title} 完整内容
          <textarea aria-label={`${title} 完整内容`} value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>取消编辑</button>
          <button type="button" onClick={() => { onSave(draft); onClose() }}>保存 Prompt</button>
        </div>
      </section>
    </div>
  )
}

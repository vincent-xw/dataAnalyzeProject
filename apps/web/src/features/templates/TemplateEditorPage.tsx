import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { FieldDefinition, FieldType } from '@data-analyze/contracts'

import { apiRequest } from '../../api/client'

const initialField: FieldDefinition = {
  name: '',
  type: 'string',
  description: '',
  required: false,
}
export function TemplateEditorPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [processingPrompt, setProcessingPrompt] = useState('')
  const [reportingPrompt, setReportingPrompt] = useState('')
  const [fields, setFields] = useState<FieldDefinition[]>([{ ...initialField }])
  const [error, setError] = useState('')

  function updateField(index: number, patch: Partial<FieldDefinition>) {
    // 只修改用户正在编辑的字段，保留其余字段的显式配置。
    setFields((current) => current.map((field, itemIndex) => (itemIndex === index ? { ...field, ...patch } : field)))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, fields, processingPrompt, reportingPrompt }),
      })
      navigate('/templates')
    } catch {
      setError('模板创建失败，请检查字段和 Prompt')
    }
  }

  return (
    <section className="panel">
      <h2>新建分析模板</h2>
      <form onSubmit={submit}>
        <label>名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>描述<input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <fieldset className="stack">
          <legend>标准字段</legend>
          {fields.map((field, index) => (
            <div className="row" key={index}>
              <input aria-label={`字段 ${index + 1} 名称`} required value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} />
              <select aria-label={`字段 ${index + 1} 类型`} value={field.type} onChange={(event) => updateField(index, { type: event.target.value as FieldType })}>
                <option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option><option value="date">日期</option>
              </select>
              <input aria-label={`字段 ${index + 1} 描述`} required value={field.description} onChange={(event) => updateField(index, { description: event.target.value })} />
              <label><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />必填</label>
              {fields.length > 1 ? <button type="button" onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>删除</button> : null}
            </div>
          ))}
          <button type="button" onClick={() => setFields((current) => [...current, { ...initialField }])}>添加字段</button>
        </fieldset>
        <label>数据加工预设 Prompt<textarea required value={processingPrompt} onChange={(event) => setProcessingPrompt(event.target.value)} /></label>
        <label>报表预设 Prompt<textarea required value={reportingPrompt} onChange={(event) => setReportingPrompt(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit">创建模板</button>
      </form>
    </section>
  )
}

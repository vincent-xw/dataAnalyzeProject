import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { FieldDefinition, FieldType } from '@data-analyze/contracts'

import { ApiError, apiRequest } from '../../api/client'
import { PromptEditorDialog } from './PromptEditorDialog'

type SourceInspection = { rowCount: number; columnCount: number; sheets: string[]; sourceFields: string[] }
type SourceInspectionResult = { status: 'inspected' | 'awaiting_sheet'; inspection?: SourceInspection; sheets?: string[] }

const initialField: FieldDefinition = {
  sourceLabel: '',
  name: '',
  type: 'string',
  required: false,
}

const defaultProcessingPrompt = `你负责在受控的数据加工平台中选择执行方案。

1. 仅依据系统提供的标准字段、数据规模、已启用脚本清单、脚本输入规范和用户需求决策。
2. 只有某个精确 scriptId@version 能完整满足需求时才推荐；无法完整满足时明确返回不支持和限制。
3. 不生成、修改或执行代码；不猜测不存在的字段、参数或脚本能力。
4. 不要求、推断或使用原始数据行、用户标识、密钥、URL 等敏感内容。
5. 参数必须符合目标脚本的输入协议；优先选择最小、可解释的参数集。`

const defaultReportingPrompt = `你负责为已完成的数据加工结果生成受限报表配置。

1. 仅使用系统提供的结果字段 Schema、固定组件协议和本次展示需求。
2. 仅生成 metric、table、bar、line、pie 组件，以及 select、multi-select、date-range 筛选器。
3. 所有维度、指标和筛选字段必须真实存在于结果 Schema；标题、说明和筛选标签使用中文。
4. 不生成 HTML、CSS、JavaScript、运行时表达式、外部链接或未知组件。
5. 优先给出少量、清晰、可直接阅读的关键指标和趋势/对比视图。`

type EditingPrompt = 'processing' | 'reporting' | null

export function TemplateEditorPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [processingPrompt, setProcessingPrompt] = useState(defaultProcessingPrompt)
  const [reportingPrompt, setReportingPrompt] = useState(defaultReportingPrompt)
  const [fields, setFields] = useState<FieldDefinition[]>([{ ...initialField }])
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [csvEncoding, setCsvEncoding] = useState('utf-8')
  const [csvDelimiter, setCsvDelimiter] = useState(',')
  const [selectedSheet, setSelectedSheet] = useState('')
  const [sourceInspection, setSourceInspection] = useState<SourceInspection | null>(null)
  const [sourceSheets, setSourceSheets] = useState<string[]>([])
  const [fieldInstruction, setFieldInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<EditingPrompt>(null)
  const [error, setError] = useState('')

  function updateField(index: number, patch: Partial<FieldDefinition>) {
    // 只修改用户正在编辑的字段，保留其余字段的显式配置。
    setFields((current) => current.map((field, itemIndex) => (itemIndex === index ? { ...field, ...patch } : field)))
  }

  function handleSourceFileChange(file: File | null) {
    setSourceFile(file)
    setSourceInspection(null)
    setSourceSheets([])
    setSelectedSheet('')
    setError('')
    if (file?.name.toLowerCase().endsWith('.xlsx')) void preloadXlsxSheets(file)
  }

  async function preloadXlsxSheets(file: File) {
    try {
      const result = await inspectSource(file)
      const sheets = result.status === 'awaiting_sheet' ? result.sheets || [] : result.inspection?.sheets || []
      setSourceSheets(sheets)
      setSelectedSheet(sheets[0] || '')
      if (result.status === 'inspected' && result.inspection) setSourceInspection(result.inspection)
    } catch (reason) {
      reportError(formatGenerationError(reason), '工作表目录读取失败', reason)
    }
  }

  function inspectSource(file: File, sheet = '') {
    return apiRequest<SourceInspectionResult>('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': file.type,
        'x-file-name': encodeURIComponent(file.name),
        ...(file.name.toLowerCase().endsWith('.csv') ? { 'x-csv-encoding': csvEncoding, 'x-csv-delimiter': csvDelimiter } : {}),
        ...(sheet ? { 'x-selected-sheet': encodeURIComponent(sheet) } : {}),
      },
      body: file,
    })
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
    } catch (reason) {
      reportError('模板创建失败，请检查字段和 Prompt', '模板创建失败', reason)
    }
  }

  async function generateFields() {
    if (!sourceFile) return setError('请先选择 CSV 或 XLSX 文件')
    setGenerating(true)
    setError('')
    try {
      const inspectionResult = await inspectSource(sourceFile, selectedSheet)
      if (inspectionResult.status === 'awaiting_sheet') {
        setSourceSheets(inspectionResult.sheets || [])
        setSelectedSheet(inspectionResult.sheets?.[0] || '')
        setError('已默认选中第一个工作表，请确认后再次点击生成')
        return
      }
      if (!inspectionResult.inspection) throw new Error('INSPECTION_MISSING')
      setSourceInspection(inspectionResult.inspection)
      setSourceSheets(inspectionResult.inspection.sheets)
      const generated = await apiRequest<{ fields: FieldDefinition[] }>('/api/templates/generate-fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inspection: inspectionResult.inspection, instruction: fieldInstruction || undefined }),
      })
      setFields(generated.fields)
    } catch (reason) {
      reportError(formatGenerationError(reason), '字段生成失败', reason)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="panel">
      {error ? <div className="toast-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>关闭提示</button></div> : null}
      <h2>新建分析模板</h2>
      <form onSubmit={submit}>
        <label>名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>描述<input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <fieldset className="stack">
          <legend>从数据表生成标准字段（只发送列名和规模，不发送数据行）</legend>
          <input type="file" accept=".csv,.xlsx" onChange={(event) => handleSourceFileChange(event.target.files?.[0] || null)} />
          {sourceFile?.name.toLowerCase().endsWith('.csv') ? <div className="row">
            <label>编码<select value={csvEncoding} onChange={(event) => setCsvEncoding(event.target.value)}><option value="utf-8">UTF-8</option><option value="utf-8-bom">UTF-8 BOM</option><option value="gb18030">GB18030</option></select></label>
            <label>分隔符<select value={csvDelimiter} onChange={(event) => setCsvDelimiter(event.target.value)}><option value=",">逗号</option><option value="\t">Tab</option><option value=";">分号</option></select></label>
          </div> : null}
          {sourceFile?.name.toLowerCase().endsWith('.xlsx') && sourceSheets.length ? <label>工作表<select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)}>{sourceSheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label> : null}
          <label>补充要求（可选）<input value={fieldInstruction} onChange={(event) => setFieldInstruction(event.target.value)} placeholder="例如：金额统一为 number，客户名称作为 string" /></label>
          <button type="button" onClick={generateFields} disabled={generating}>{generating ? '生成中…' : '检查表头并生成字段'}</button>
          {sourceInspection ? <small>已检查 {sourceInspection.rowCount} 行、{sourceInspection.columnCount} 列；下方字段可继续手动修改。</small> : null}
        </fieldset>
        <fieldset className="stack">
          <legend>标准字段</legend>
          {fields.map((field, index) => (
            <div className="row" key={index}>
              <input aria-label={`字段 ${index + 1} 名称`} required value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} />
              <select aria-label={`字段 ${index + 1} 类型`} value={field.type} onChange={(event) => updateField(index, { type: event.target.value as FieldType })}>
                <option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option><option value="date">日期</option>
              </select>
              <input aria-label={`字段 ${index + 1} 原表头`} required value={field.sourceLabel} onChange={(event) => updateField(index, { sourceLabel: event.target.value })} />
              <label><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />必填</label>
              {fields.length > 1 ? <button type="button" onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>删除</button> : null}
            </div>
          ))}
          <button type="button" onClick={() => setFields((current) => [...current, { ...initialField }])}>添加字段</button>
        </fieldset>
        <label>数据加工预设 Prompt<textarea required value={processingPrompt} onChange={(event) => setProcessingPrompt(event.target.value)} /></label>
        <button type="button" onClick={() => setEditingPrompt('processing')}>放大编辑数据加工预设 Prompt</button>
        <label>报表预设 Prompt<textarea required value={reportingPrompt} onChange={(event) => setReportingPrompt(event.target.value)} /></label>
        <button type="button" onClick={() => setEditingPrompt('reporting')}>放大编辑报表预设 Prompt</button>
        <button type="submit">创建模板</button>
      </form>
      {editingPrompt === 'processing' ? <PromptEditorDialog title="数据加工预设 Prompt" value={processingPrompt} onSave={setProcessingPrompt} onClose={() => setEditingPrompt(null)} /> : null}
      {editingPrompt === 'reporting' ? <PromptEditorDialog title="报表预设 Prompt" value={reportingPrompt} onSave={setReportingPrompt} onClose={() => setEditingPrompt(null)} /> : null}
    </section>
  )

  function reportError(message: string, label: string, reason: unknown) {
    console.error(label, reason)
    setError(message)
  }
}

function formatGenerationError(reason: unknown) {
  if (reason instanceof ApiError && reason.payload && typeof reason.payload === 'object' && 'message' in reason.payload) {
    return `字段生成失败：${String(reason.payload.message)}`
  }
  if (reason instanceof Error && reason.message) return `字段生成失败：${reason.message}`
  return '字段生成失败，请检查文件格式和 LLM 配置'
}

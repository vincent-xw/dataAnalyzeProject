import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DatasetInspection, FieldDefinition } from '@data-analyze/contracts'

import { apiRequest } from '../../api/client'

type TemplateSummary = { id: string; name: string; fields: FieldDefinition[] }
type UploadResult = { id: string; versionId: string; status: 'uploaded' }
type InspectResult =
  | { status: 'awaiting_sheet'; sheets: string[] }
  | { status: 'inspected'; inspection: DatasetInspection }

export function DatasetUploadPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templateId, setTemplateId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [encoding, setEncoding] = useState('')
  const [delimiter, setDelimiter] = useState('')
  const [pendingVersionId, setPendingVersionId] = useState('')
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest<TemplateSummary[]>('/api/templates').then(setTemplates).catch(() => setError('模板列表加载失败'))
  }, [])

  const selectedTemplate = templates.find((template) => template.id === templateId)
  const isCsv = file?.name.toLowerCase().endsWith('.csv') ?? false

  async function inspect(versionId: string, sheet?: string) {
    const options = isCsv ? { encoding, delimiter } : sheet ? { selectedSheet: sheet } : {}
    const result = await apiRequest<InspectResult>(`/api/datasets/${versionId}/inspect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    })
    if (result.status === 'awaiting_sheet') {
      const firstSheet = result.sheets[0]
      if (!firstSheet) throw new Error('WORKBOOK_SHEET_MISSING')
      setPendingVersionId(versionId)
      setSheets(result.sheets)
      setSelectedSheet(firstSheet)
      // 工作簿目录的顺序即 Excel 中的工作表顺序；默认检查首表，减少一次手动确认。
      await inspect(versionId, firstSheet)
      return
    }
    if (!selectedTemplate) throw new Error('SELECTED_TEMPLATE_NOT_FOUND')
    navigate(`/datasets/${versionId}/mapping`, {
      state: { template: selectedTemplate, inspection: result.inspection },
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!file || !selectedTemplate) return
    try {
      const contentType = isCsv
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const uploaded = await apiRequest<UploadResult>('/api/datasets', {
        method: 'POST',
        headers: { 'content-type': contentType, 'x-file-name': encodeURIComponent(file.name), 'x-template-id': selectedTemplate.id },
        body: file,
      })
      await inspect(uploaded.versionId)
    } catch {
      setError('文件上传或结构检查失败')
    }
  }

  return (
    <section className="panel stack">
      <h2>上传数据集</h2>
      <form onSubmit={submit}>
        <label>分析模板<select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">请选择模板</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
        <label>CSV 或 XLSX 文件<input required type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        {isCsv ? (
          <div className="row">
            <label>CSV 编码<select required value={encoding} onChange={(event) => setEncoding(event.target.value)}><option value="">请选择编码</option><option value="utf-8">UTF-8</option><option value="utf-8-bom">UTF-8 BOM</option><option value="gb18030">GB18030</option></select></label>
            <label>CSV 分隔符<select required value={delimiter} onChange={(event) => setDelimiter(event.target.value)}><option value="">请选择分隔符</option><option value=",">逗号</option><option value="\t">制表符</option><option value=";">分号</option></select></label>
          </div>
        ) : null}
        {error && <p className="error">{error}</p>}
        <button type="submit">上传并检查</button>
      </form>
      {sheets.length > 0 ? (
        <div className="row">
          <label>选择工作表<select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)}><option value="">请选择工作表</option>{sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label>
          <button type="button" disabled={!selectedSheet} onClick={() => inspect(pendingVersionId, selectedSheet).catch(() => setError('工作表检查失败'))}>检查所选工作表</button>
        </div>
      ) : null}
    </section>
  )
}

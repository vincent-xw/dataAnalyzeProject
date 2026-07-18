import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { apiRequest } from '../../api/client'

export function AssetUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [encoding, setEncoding] = useState('utf-8')
  const [delimiter, setDelimiter] = useState(',')
  const [error, setError] = useState('')
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setError('')
    try {
      const isXlsx = file.name.toLowerCase().endsWith('.xlsx')
      const result = await apiRequest<{ id: string } | { status: 'awaiting_sheet'; sheets: string[] }>('/api/assets/upload', {
        method: 'POST',
        headers: { 'content-type': isXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv', 'x-file-name': encodeURIComponent(file.name), ...(isXlsx ? selectedSheet ? { 'x-selected-sheet': encodeURIComponent(selectedSheet) } : {} : { 'x-csv-encoding': encoding, 'x-csv-delimiter': delimiter }) },
        body: file,
      })
      if ('status' in result) { setSheets(result.sheets); setSelectedSheet(result.sheets[0] || ''); return }
      const asset = result
      navigate(`/assets/${asset.id}`)
    } catch {
      setError('文件上传或转换失败，请检查 CSV 格式。')
    }
  }

  return <section className="panel stack"><h2>上传数据</h2><p>上传后会直接转换为可预览、可维护的数据资产。</p><form onSubmit={submit} className="stack">
    <label>CSV 或 XLSX 文件<input required type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] || null); setSheets([]); setSelectedSheet('') }} /></label>
    {!file?.name.toLowerCase().endsWith('.xlsx') ? <><label>编码<select value={encoding} onChange={(event) => setEncoding(event.target.value)}><option value="utf-8">UTF-8</option><option value="utf-8-bom">UTF-8 BOM</option><option value="gb18030">GB18030</option></select></label><label>分隔符<select value={delimiter} onChange={(event) => setDelimiter(event.target.value)}><option value=",">逗号</option><option value="\t">制表符</option><option value=";">分号</option></select></label></> : null}
    {sheets.length ? <label>工作表<select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)}>{sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label> : null}
    {error ? <p className="error">{error}</p> : null}<button type="submit">上传并转换</button>
  </form></section>
}

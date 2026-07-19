import { Button, Form, Select, Upload, type UploadProps } from 'antd'
import { useState } from 'react'
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
  const [uploading, setUploading] = useState(false)

  const uploadProps: UploadProps = {
    accept: '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    beforeUpload: () => false,
    disabled: uploading,
    maxCount: 1,
    onChange: (info) => {
      setFile(info.fileList[0]?.originFileObj || null)
      setSheets([])
      setSelectedSheet('')
    },
  }

  async function submit() {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const isXlsx = file.name.toLowerCase().endsWith('.xlsx')
      const result = await apiRequest<{ id: string } | { status: 'awaiting_sheet'; sheets: string[] }>('/api/assets/upload', {
        method: 'POST',
        headers: { 'content-type': isXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv', 'x-file-name': encodeURIComponent(file.name), ...(isXlsx ? selectedSheet ? { 'x-selected-sheet': encodeURIComponent(selectedSheet) } : {} : { 'x-csv-encoding': encoding, 'x-csv-delimiter': delimiter }) },
        body: file,
      })
      if ('status' in result) { setSheets(result.sheets); setSelectedSheet(result.sheets[0] || ''); return }
      navigate(`/assets/${result.id}`)
    } catch {
      setError('文件上传或转换失败，请检查 CSV 格式。')
    } finally {
      setUploading(false)
    }
  }

  const isXlsx = file?.name.toLowerCase().endsWith('.xlsx')
  const submitLabel = uploading ? (isXlsx && !selectedSheet ? '正在读取工作表…' : '正在上传并转换…') : '上传并转换'

  return <section className="stack"><div className="page-heading"><div><p className="eyebrow">数据资产</p><h2>上传数据</h2><p>上传后会直接转换为可预览、可维护的数据资产。</p></div></div><Form className="panel stack" layout="vertical" onFinish={submit}>
    <Form.Item label="CSV 或 XLSX 文件" required><Upload {...uploadProps}><Button disabled={uploading}>选择文件</Button></Upload></Form.Item>
    {!isXlsx ? <><Form.Item label="编码"><Select value={encoding} onChange={setEncoding} options={[{ value: 'utf-8', label: 'UTF-8' }, { value: 'utf-8-bom', label: 'UTF-8 BOM' }, { value: 'gb18030', label: 'GB18030' }]} /></Form.Item><Form.Item label="分隔符"><Select value={delimiter} onChange={setDelimiter} options={[{ value: ',', label: '逗号' }, { value: '\t', label: '制表符' }, { value: ';', label: '分号' }]} /></Form.Item></> : null}
    {sheets.length ? <Form.Item label="工作表"><Select disabled={uploading} value={selectedSheet} onChange={setSelectedSheet} options={sheets.map((sheet) => ({ value: sheet, label: sheet }))} /></Form.Item> : null}
    {error ? <p className="error">{error}</p> : null}<Button type="primary" htmlType="submit" disabled={!file} loading={uploading}>{submitLabel}</Button>
  </Form></section>
}

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import type { ReportConfig } from '@data-analyze/report-schema'

import { ApiError, apiRequest } from '../../api/client'
import { ReportRenderer } from './ReportRenderer'
import type { ReportRow } from './filter-data'

type ReportDetail = {
  id: string
  config: ReportConfig
  published: boolean
}

export function ReportViewPage() {
  const { reportVersionId } = useParams()
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [data, setData] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!reportVersionId) return
    Promise.all([
      apiRequest<ReportDetail>(`/api/report-versions/${reportVersionId}`),
      apiRequest<ReportRow[]>(`/api/report-versions/${reportVersionId}/data`),
    ])
      .then(([report, rows]) => {
        if (!report.published) {
          setError('REPORT_NOT_PUBLISHED：报表尚未发布')
          return
        }
        setDetail(report)
        setData(rows)
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.payload && typeof reason.payload === 'object' && 'code' in reason.payload) {
          setError(`${String(reason.payload.code)}：报表加载失败`)
        } else {
          setError('REPORT_LOAD_FAILED：报表加载失败')
        }
      })
  }, [reportVersionId])

  if (error) return <p className="error">{error}</p>
  if (!detail || !data) return <p>正在加载报表…</p>
  return <ReportRenderer config={detail.config} data={data} />
}

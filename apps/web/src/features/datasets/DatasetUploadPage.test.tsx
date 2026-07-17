import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DatasetUploadPage } from './DatasetUploadPage'

const template = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '销售分析',
  fields: [{ name: 'sales_amount', type: 'number', sourceLabel: '销售金额', required: true }],
}

const inspection = {
  rowCount: 1,
  columnCount: 1,
  sheets: ['一月', '二月'],
  sourceFields: ['销售金额'],
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

describe('DatasetUploadPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Excel 返回多个工作表时自动检查第一个工作表', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([template]))
      .mockResolvedValueOnce(jsonResponse({ id: 'd1', versionId: 'v1', status: 'uploaded' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'awaiting_sheet', sheets: ['一月', '二月'] }))
      .mockResolvedValueOnce(jsonResponse({ status: 'inspected', inspection }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<MemoryRouter><DatasetUploadPage /></MemoryRouter>)
    const templateSelect = await screen.findByLabelText('分析模板')
    await user.selectOptions(templateSelect, template.id)
    expect(templateSelect).toHaveValue(template.id)
    const fileInput = screen.getByLabelText('CSV 或 XLSX 文件')
    const workbook = new File(['xlsx-content'], '销售.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    await user.upload(fileInput, workbook)
    expect(fileInput.files).toContain(workbook)
    fireEvent.submit(screen.getByRole('button', { name: '上传并检查' }).closest('form')!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/datasets/v1/inspect',
      expect.objectContaining({ body: JSON.stringify({ selectedSheet: '一月' }) }),
    )
  })
})

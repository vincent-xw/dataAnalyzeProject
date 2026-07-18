import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TemplatePreviewPage } from './TemplatePreviewPage'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('../../api/client', () => ({ apiRequest }))

describe('TemplatePreviewPage', () => {
  beforeEach(() => {
    apiRequest.mockResolvedValue({
      id: 'template-1',
      name: '销售分析',
      description: '按地区汇总销售额',
      fields: [{ name: 'sales_amount', sourceLabel: '销售额', type: 'number', required: true }],
      processingPrompt: { version: 2, content: '新版加工 Prompt' },
      reportingPrompt: { version: 2, content: '新版报表 Prompt' },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('加载并展示模板标准字段和两个当前 Prompt', async () => {
    render(
      <MemoryRouter initialEntries={['/templates/template-1']}>
        <Routes><Route path="/templates/:templateId" element={<TemplatePreviewPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('销售分析')).toBeVisible()
    expect(screen.getByText('销售额')).toBeVisible()
    expect(screen.getByText('新版加工 Prompt')).toBeVisible()
    expect(screen.getByText('新版报表 Prompt')).toBeVisible()
    expect(apiRequest).toHaveBeenCalledWith('/api/templates/template-1')
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReportEditorPage } from './ReportEditorPage'

describe('ReportEditorPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('只有有效草稿才显示发布按钮', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        taskId: 'task-1',
        templateId: 'template-1',
        templateName: '销售模板',
        reportingPromptVersionId: 'prompt-1',
        reportingPrompt: '使用固定组件生成报表',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'report-version-1',
        validationStatus: 'valid',
        config: {
          title: '区域销售概览',
          description: '销售数据',
          filters: [],
          widgets: [{ id: 'metric', type: 'metric', title: '销售总额', dataset: 'result', metric: 'totalAmount', aggregation: 'sum', format: 'currency', layout: { x: 0, y: 0, w: 4, h: 2 } }],
        },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ totalAmount: 150 }]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ReportEditorPage taskId="task-1" />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('本次展示需求'), '按区域展示销售额')
    await user.click(screen.getByRole('button', { name: '生成预览' }))

    expect(await screen.findByText('区域销售概览')).toBeVisible()
    expect(screen.getByRole('button', { name: '确认发布' })).toBeEnabled()
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TemplateEditorPage } from './TemplateEditorPage'

describe('TemplateEditorPage', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('保存放大编辑内容后回写数据加工预设 Prompt', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: '放大编辑数据加工预设 Prompt' }))
    const editor = screen.getByLabelText('数据加工预设 Prompt 完整内容')
    await user.clear(editor)
    await user.type(editor, '仅使用已启用脚本完成汇总。')
    await user.click(screen.getByRole('button', { name: '保存 Prompt' }))

    expect(screen.getByDisplayValue('仅使用已启用脚本完成汇总。')).toBeVisible()
  })

  it('取消放大编辑时保留原报表预设 Prompt', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>)
    const initialValue = (screen.getByLabelText('报表预设 Prompt') as HTMLTextAreaElement).value

    await user.click(screen.getByRole('button', { name: '放大编辑报表预设 Prompt' }))
    await user.clear(screen.getByLabelText('报表预设 Prompt 完整内容'))
    await user.type(screen.getByLabelText('报表预设 Prompt 完整内容'), '不应保存')
    await user.click(screen.getByRole('button', { name: '取消编辑' }))

    expect(screen.getByLabelText('报表预设 Prompt')).toHaveValue(initialValue)
  })

  it('中文文件名检查失败时显示就地错误并使用安全请求头', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('网络不可用'))
    const errorLogger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetcher)
    const { container } = render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>)
    const file = new File(['订单号\nA001\n'], '销售数据.csv', { type: 'text/csv' })

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    await user.click(screen.getByRole('button', { name: '检查表头并生成字段' }))

    expect(fetcher).toHaveBeenCalledWith('/api/templates/inspect-source', expect.objectContaining({
      headers: expect.objectContaining({ 'x-file-name': encodeURIComponent('销售数据.csv') }),
    }))
    expect(await screen.findByRole('alert')).toHaveClass('toast-error')
    expect(screen.getByText('字段生成失败：网络不可用')).toBeVisible()
    expect(errorLogger).toHaveBeenCalledWith('字段生成失败', expect.any(Error))
  })

  it('选择多工作表 XLSX 后默认选中第一个工作表', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ status: 'awaiting_sheet', sheets: ['一月', '二月'] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
    const { container } = render(<MemoryRouter><TemplateEditorPage /></MemoryRouter>)
    const file = new File(['xlsx'], '销售数据.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)

    expect(await screen.findByLabelText('工作表')).toHaveValue('一月')
  })

  it('编辑模式加载模板并使用 PUT 保存', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (path, init) => {
      if (path === '/api/templates/template-1' && !init) {
        return new Response(JSON.stringify({
          id: 'template-1',
          name: '销售分析',
          description: '按地区汇总销售额',
          fields: [{ name: 'sales_amount', sourceLabel: '销售额', type: 'number', required: true }],
          processingPrompt: { version: 1, content: '加工 Prompt' },
          reportingPrompt: { version: 1, content: '报表 Prompt' },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (path === '/api/templates/template-1' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ id: 'template-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`意外请求：${String(path)}`)
    })
    vi.stubGlobal('fetch', fetcher)

    render(
      <MemoryRouter initialEntries={['/templates/template-1/edit']}>
        <Routes><Route path="/templates/:templateId/edit" element={<TemplateEditorPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('名称')).toHaveValue('销售分析')
    await user.click(screen.getByRole('button', { name: '保存模板' }))
    expect(fetcher).toHaveBeenCalledWith('/api/templates/template-1', expect.objectContaining({ method: 'PUT' }))
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { TemplateListPage } from './TemplateListPage'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, apiRequest }
})

describe('TemplateListPage', () => {
  beforeEach(() => {
    apiRequest.mockResolvedValue([{
      id: 'template-1',
      name: '销售分析',
      description: '按地区汇总销售额',
      fields: [{ name: 'sales_amount', sourceLabel: '销售额', type: 'number', required: true }],
    }])
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('为每个模板提供预览、编辑和删除操作', async () => {
    render(<MemoryRouter><TemplateListPage /></MemoryRouter>)

    expect(await screen.findByText('销售分析')).toBeVisible()
    expect(screen.getByRole('link', { name: '预览' })).toHaveAttribute('href', '/templates/template-1')
    expect(screen.getByRole('link', { name: '编辑' })).toHaveAttribute('href', '/templates/template-1/edit')
    expect(screen.getByRole('button', { name: '删除' })).toBeVisible()
  })

  it('确认删除后请求 API 并从列表移除模板', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TemplateListPage /></MemoryRouter>)

    await screen.findByText('销售分析')
    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(confirm).toHaveBeenCalled()
    expect(apiRequest).toHaveBeenCalledWith('/api/templates/template-1', { method: 'DELETE' })
    expect(screen.queryByText('销售分析')).not.toBeInTheDocument()
  })

  it('删除被数据集引用的模板失败时显示原因并保留模板', async () => {
    const user = userEvent.setup()
    apiRequest
      .mockResolvedValueOnce([{
        id: 'template-1',
        name: '销售分析',
        description: '按地区汇总销售额',
        fields: [{ name: 'sales_amount', sourceLabel: '销售额', type: 'number', required: true }],
      }])
      .mockRejectedValueOnce(new ApiError(409, {
        code: 'TEMPLATE_IN_USE',
        message: '模板已被数据集引用，不能删除',
      }))
    render(<MemoryRouter><TemplateListPage /></MemoryRouter>)

    await screen.findByText('销售分析')
    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(await screen.findByText('模板已被数据集引用，不能删除')).toBeVisible()
    expect(screen.getByText('销售分析')).toBeVisible()
  })
})

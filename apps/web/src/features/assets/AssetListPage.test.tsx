import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AssetListPage } from './AssetListPage'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('../../api/client', () => ({ apiRequest }))

describe('AssetListPage', () => {
  beforeEach(() => {
    apiRequest.mockResolvedValue([{
      id: 'asset-1',
      name: '2026 春季三年二班期中成绩',
      templateName: '学生成绩',
      tags: ['王老师', '三年二班'],
      rowCount: 42,
      createdAt: '2026-07-17T10:00:00.000Z',
      kind: 'source',
      description: '期中成绩',
      status: 'ready',
      templateId: 'template-1',
      dataObjectKey: 'data.ndjson',
      schemaObjectKey: 'schema.json',
      createdBy: 'teacher@example.com',
      updatedAt: '2026-07-17T10:00:00.000Z',
    }])
  })

  it('以表格呈现可识别的数据资产并提供预览入口', async () => {
    render(<MemoryRouter><AssetListPage /></MemoryRouter>)

    expect(await screen.findByText('2026 春季三年二班期中成绩')).toBeInTheDocument()
    expect(screen.getByText('42 行')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '预览数据' })).toHaveAttribute('href', '/assets/asset-1')
  })

  it('加载期间显示占位而非空状态', () => {
    apiRequest.mockReturnValue(new Promise(() => undefined))
    render(<MemoryRouter><AssetListPage /></MemoryRouter>)

    expect(screen.getByText('正在加载数据资产…')).toBeInTheDocument()
    expect(screen.queryByText('还没有可用数据')).not.toBeInTheDocument()
  })
})

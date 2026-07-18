import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AssetDetailPage } from './AssetDetailPage'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('../../api/client', () => ({ apiRequest }))

describe('AssetDetailPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    apiRequest.mockImplementation((path: string) => {
      if (path.endsWith('/preview')) return Promise.resolve({ rowCount: 2, rows: [{ student_name: '张三', total_score: 178 }] })
      if (path === '/api/assets/asset-1') return Promise.resolve({
        id: 'asset-1', name: '三年二班期中成绩', description: '王老师录入', tags: ['王老师'],
        rowCount: 2, templateName: '学生成绩', kind: 'source', status: 'ready',
      })
      if (path.endsWith('/metadata-suggestions')) return Promise.resolve({
        name: '2026 春季三年二班期中成绩', description: '王老师录入的期中成绩', tags: ['王老师', '三年二班'],
      })
      return Promise.resolve({})
    })
  })

  it('优先展示真实预览数据，并允许保存人工元数据', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/asset-1']}>
        <Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('张三')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '数据分析' })).toHaveAttribute('href', '/assets/asset-1/analyses')
    fireEvent.change(screen.getByLabelText('资产名称'), { target: { value: '2026 春季三年二班期中成绩' } })
    fireEvent.click(screen.getByRole('button', { name: '保存元数据' }))
    expect(apiRequest).toHaveBeenCalledWith('/api/assets/asset-1/metadata', expect.objectContaining({ method: 'PUT' }))
  })

  it('使用用户说明请求识别元数据建议，不把预览行发送给模型', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/asset-1']}>
        <Routes><Route path="/assets/:assetId" element={<AssetDetailPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByText('张三')
    fireEvent.change(screen.getByLabelText('说明'), { target: { value: '王老师为三年二班录入的期中成绩' } })
    fireEvent.click(screen.getByRole('button', { name: '智能整理识别信息' }))
    expect(apiRequest).toHaveBeenCalledWith('/api/assets/asset-1/metadata-suggestions', expect.objectContaining({ method: 'POST' }))
  })
})

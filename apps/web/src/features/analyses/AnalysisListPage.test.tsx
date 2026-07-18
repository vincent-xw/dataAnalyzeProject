import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisListPage } from './AnalysisListPage'
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() })); vi.mock('../../api/client', () => ({ apiRequest }))
describe('AnalysisListPage', () => { beforeEach(() => apiRequest.mockImplementation((path?: string) => path === '/api/assets' ? Promise.resolve([{ id: 'a', name: '成绩' }]) : Promise.resolve([])))
  it('提交自然语言需求创建分析', async () => { render(<MemoryRouter initialEntries={['/analyses']}><Routes><Route path="/analyses" element={<AnalysisListPage />} /></Routes></MemoryRouter>); await screen.findByText('历史分析'); fireEvent.click(screen.getByRole('checkbox')); fireEvent.change(screen.getByLabelText('分析需求'), { target: { value: '按姓名展示成绩' } }); fireEvent.click(screen.getByRole('button', { name: '创建分析' })); expect(apiRequest).toHaveBeenCalledWith('/api/analyses', expect.objectContaining({ method: 'POST' })) }) })

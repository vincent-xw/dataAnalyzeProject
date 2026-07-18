import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisListPage } from './AnalysisListPage'
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() })); vi.mock('../../api/client', () => ({ apiRequest }))
describe('AnalysisListPage', () => { beforeEach(() => apiRequest.mockImplementation((path?: string) => path === '/api/assets' ? Promise.resolve([{ id: 'a', name: '成绩' }]) : path === '/api/assets/a/preview' ? Promise.resolve({ rows: [{ name: '张三', score: 90 }] }) : Promise.resolve([])))
  it('选表后展示预览并提交自然语言需求创建分析', async () => { render(<MemoryRouter initialEntries={['/analyses']}><Routes><Route path="/analyses" element={<AnalysisListPage />} /></Routes></MemoryRouter>); await screen.findByText('历史分析'); fireEvent.click(screen.getByRole('checkbox')); expect(await screen.findByText('张三')).toBeInTheDocument(); expect(apiRequest).toHaveBeenCalledWith('/api/assets/a/preview'); fireEvent.change(screen.getByLabelText('分析需求'), { target: { value: '按姓名展示成绩' } }); fireEvent.click(screen.getByRole('button', { name: '创建分析' })); expect(apiRequest).toHaveBeenCalledWith('/api/analyses', expect.objectContaining({ method: 'POST' })) }) })

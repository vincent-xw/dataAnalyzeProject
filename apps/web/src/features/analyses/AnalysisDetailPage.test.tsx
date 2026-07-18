import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AnalysisDetailPage } from './AnalysisDetailPage'
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() })); vi.mock('../../api/client', () => ({ apiRequest }))
describe('AnalysisDetailPage', () => { it('展示冻结规则和图表容器', async () => { apiRequest.mockResolvedValue({ title: '成绩分析', requirement: '按姓名展示成绩', status: 'ready', rows: [{ name: '张三', score: 90 }], config: { title: '成绩分析', description: '说明', filters: [], widgets: [{ id: 'chart', type: 'bar', title: '成绩', dataset: 'result', dimension: 'name', metric: 'score', layout: { x: 0, y: 0, w: 12, h: 5 } }] } }); render(<MemoryRouter initialEntries={['/analyses/x']}><Routes><Route path="/analyses/:analysisId" element={<AnalysisDetailPage />} /></Routes></MemoryRouter>); expect(await screen.findByText('按姓名展示成绩')).toBeInTheDocument(); expect(screen.getByTestId('chart-chart')).toBeInTheDocument() }) })

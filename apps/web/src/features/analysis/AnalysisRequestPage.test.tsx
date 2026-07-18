import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalysisRequestPage } from './AnalysisRequestPage'

const { MockApiError, mockApiRequest, mockNavigate } = vi.hoisted(() => ({
  MockApiError: class MockApiError extends Error {
    constructor(readonly payload: unknown) {
      super('API_REQUEST_FAILED')
    }
  },
  mockApiRequest: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  ApiError: MockApiError,
  apiRequest: mockApiRequest,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ versionId: '00000000-0000-4000-8000-000000000001' }),
  }
})

const context = {
  datasetVersionId: '00000000-0000-4000-8000-000000000001',
  templateId: '00000000-0000-4000-8000-000000000002',
  templateName: '销售分析',
  processingPromptVersionId: '00000000-0000-4000-8000-000000000003',
  processingPrompt: '仅作脚本选择参考',
  fields: [{ sourceLabel: '区域', name: 'region', type: 'string' as const }],
  scripts: [{
    id: 'sales-region-summary',
    version: '1.0.0',
    name: '区域销售汇总',
    description: '按区域汇总销售额',
    inputFields: [{ sourceLabel: '区域', name: 'region', type: 'string' as const, required: true }],
    outputFields: [{ sourceLabel: '销售总额', name: 'totalAmount', type: 'number' as const, required: true }],
    parameterSchema: { type: 'object' as const, properties: {}, required: [], additionalProperties: false as const },
  }],
}

describe('AnalysisRequestPage', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    mockNavigate.mockReset()
  })

  it('用户可直接选择已启用脚本，无需填写客制化需求', async () => {
    mockApiRequest
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ id: 'plan-id' })
    const user = userEvent.setup()
    render(<AnalysisRequestPage />)

    await user.click(await screen.findByRole('button', { name: '选择区域销售汇总' }))

    expect(mockApiRequest).toHaveBeenLastCalledWith(
      `/api/dataset-versions/${context.datasetVersionId}/plans/selected`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          promptVersionId: context.processingPromptVersionId,
          scriptId: 'sales-region-summary',
          scriptVersion: '1.0.0',
        }),
      }),
    )
    expect(mockNavigate).toHaveBeenCalledWith('/plans/plan-id')
  })

  it('候选代码失败时展示安全错误码与请求 ID', async () => {
    mockApiRequest
      .mockResolvedValueOnce(context)
      .mockRejectedValueOnce(new MockApiError({ code: 'LLM_REQUEST_FAILED', requestId: 'request-1' }))
    const user = userEvent.setup()
    const { container } = render(<AnalysisRequestPage />)

    await user.type(await within(container).findByLabelText('本次客制化加工需求（仅智能推荐或生成候选代码时填写）'), '生成一个汇总脚本')
    await user.click(within(container).getByRole('button', { name: '生成候选代码' }))

    expect(await within(container).findByText('LLM_REQUEST_FAILED：候选代码生成失败（请求 ID：request-1）')).toBeVisible()
  })
})

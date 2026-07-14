import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlanConfirmationPage } from './PlanConfirmationPage'

const supportedPlan = {
  id: '30000000-0000-4000-8000-000000000001',
  decision: {
    supported: true as const,
    scriptId: 'sales-region-summary',
    scriptVersion: '1.0.0',
    parameters: { includeEmptyRegion: false },
    reason: '字段结构和需求均符合该脚本能力',
    limitations: ['不自动合并相似区域名'],
  },
  scriptMetadata: {
    id: 'sales-region-summary',
    version: '1.0.0',
    name: '区域销售汇总',
    description: '按区域汇总销售额',
    inputFields: [{ name: 'region', type: 'string' as const, description: '区域', required: true }],
    outputFields: [{ name: 'totalAmount', type: 'number' as const, description: '销售总额', required: true }],
    parameterSchema: {
      type: 'object' as const,
      properties: {
        includeEmptyRegion: { type: 'boolean' as const, description: '是否允许空区域' },
      },
      required: ['includeEmptyRegion'],
      additionalProperties: false as const,
    },
  },
  confirmationStatus: 'pending' as const,
}

describe('PlanConfirmationPage', () => {
  it('展示精确脚本版本、参数、理由和限制后才允许确认', () => {
    render(<PlanConfirmationPage plan={supportedPlan} />)

    expect(screen.getByText('sales-region-summary@1.0.0')).toBeVisible()
    expect(screen.getByText('字段结构和需求均符合该脚本能力')).toBeVisible()
    expect(screen.getByText('不自动合并相似区域名')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: '是否允许空区域' })).toBeVisible()
    expect(screen.getByRole('button', { name: '确认并执行' })).toBeEnabled()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FieldMappingPage } from './FieldMappingPage'

const requiredSalesTemplate = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '销售分析',
  fields: [
    { name: 'salesAmount', type: 'number' as const, sourceLabel: '销售额', required: true },
  ],
}

const regionOnlyInspection = {
  rowCount: 2,
  columnCount: 1,
  sheets: [],
  sourceFields: ['区域'],
}

describe('FieldMappingPage', () => {
  it('必填标准字段未映射时禁用确认按钮', () => {
    render(
      <FieldMappingPage
        template={requiredSalesTemplate}
        inspection={regionOnlyInspection}
        versionId="00000000-0000-4000-8000-000000000002"
      />,
    )

    expect(screen.getByRole('button', { name: '确认字段映射' })).toBeDisabled()
    expect(screen.getByText('未映射必填字段：salesAmount')).toBeVisible()
  })

  it('首次渲染时预选中文说明匹配的标准字段', () => {
    render(
      <FieldMappingPage
        template={requiredSalesTemplate}
        inspection={{ ...regionOnlyInspection, sourceFields: ['销售额'] }}
        versionId="00000000-0000-4000-8000-000000000002"
      />,
    )

    expect(screen.getByRole('combobox', { name: '销售额 对应标准字段' })).toHaveValue('salesAmount')
  })
})

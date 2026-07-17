import { describe, expect, it, vi } from 'vitest'

import { requestReportConfig } from './llm'

const input = {
  fields: [
    { name: 'region', type: 'string' as const, sourceLabel: '区域', required: true },
    { name: 'totalAmount', type: 'number' as const, sourceLabel: '销售额', required: true },
  ],
  reportingPrompt: '生成区域销售概览',
  userRequirement: '使用柱状图',
}

const bindings = {
  LLM_BASE_URL: 'https://llm.example.com/v1',
  LLM_MODEL: 'unified-model',
  LLM_API_KEY: 'secret',
}

const validConfig = {
  title: '区域销售概览',
  description: '按区域展示销售额',
  filters: [],
  widgets: [
    {
      id: 'sales',
      type: 'bar',
      title: '区域销售额',
      dataset: 'result',
      dimension: 'region',
      metric: 'totalAmount',
      layout: { x: 0, y: 0, w: 12, h: 4 },
    },
  ],
}

function completion(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }),
    { status: 200 },
  )
}

describe('requestReportConfig', () => {
  it('报表请求不包含实际数据和对象地址，只包含固定组件协议', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion(validConfig))
    await requestReportConfig(input, bindings, fetchMock)

    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(requestBody).not.toContain('华东')
    expect(requestBody).not.toContain('data-analyze/tasks/')
    expect(requestBody).toContain('bar')
    expect(requestBody).toContain('metric')
    expect(JSON.parse(requestBody).response_format).toEqual({ type: 'json_object' })
  })

  it('拒绝未知组件和非 JSON', async () => {
    const unknownWidget = { ...validConfig, widgets: [{ id: 'x', type: 'custom-html' }] }
    await expect(
      requestReportConfig(input, bindings, vi.fn<typeof fetch>().mockResolvedValue(completion(unknownWidget))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_REPORT_CONFIG' })
    await expect(
      requestReportConfig(input, bindings, vi.fn<typeof fetch>().mockResolvedValue(completion('not-json'))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_REPORT_CONFIG' })
  })

  it('超时返回明确错误', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'AbortError'))
    await expect(requestReportConfig(input, bindings, fetchMock)).rejects.toMatchObject({
      code: 'LLM_REQUEST_TIMEOUT',
    })
  })
})

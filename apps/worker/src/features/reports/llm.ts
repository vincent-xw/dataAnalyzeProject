import type { FieldDefinition } from '@data-analyze/contracts'
import { ReportConfigSchema, type ReportConfig } from '@data-analyze/report-schema'

import type { LlmBindings } from '../llm/client'
import { createFakeReportConfig } from '../../testing/fake-llm'

export const REPORT_PLATFORM_RULES = [
  '只能使用协议内的 metric、table、bar、line、pie 组件。',
  '只能引用结果 Schema 中存在的字段。',
  '不得输出 HTML、JavaScript、CSS 或运行时表达式。',
  '不得生成代码或自定义组件。',
].join('\n')

export class ReportLlmError extends Error {
  constructor(
    readonly code: 'LLM_REQUEST_TIMEOUT' | 'LLM_REQUEST_FAILED' | 'LLM_INVALID_REPORT_CONFIG',
    message: string,
  ) {
    super(message)
  }
}

type ReportConfigInput = {
  fields: FieldDefinition[]
  reportingPrompt: string
  userRequirement: string
}

const componentProtocol = {
  widgets: {
    chart: {
      type: ['bar', 'line', 'pie'],
      fields: ['id', 'title', 'dataset=result', 'dimension', 'metric', 'layout'],
    },
    metric: {
      type: 'metric',
      fields: ['id', 'title', 'dataset=result', 'metric', 'aggregation', 'format', 'layout'],
    },
    table: {
      type: 'table',
      fields: ['id', 'title', 'dataset=result', 'columns', 'layout'],
    },
  },
  filters: ['select', 'multi-select', 'date-range'],
  layout: { columns: 12, x: '0..11', w: '1..12', h: '1..12' },
} as const

const responseJsonSchema = {
  type: 'object',
  required: ['title', 'description', 'filters', 'widgets'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    filters: { type: 'array' },
    widgets: { type: 'array', minItems: 1 },
  },
  additionalProperties: false,
} as const

/**
 * 输入类型不包含结果数据、任务对象 Key 或 URL；模型只能看到字段描述和固定组件协议。
 */
export async function requestReportConfig(
  input: ReportConfigInput,
  bindings: LlmBindings,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<ReportConfig> {
  if (bindings.ENVIRONMENT === 'test') return createFakeReportConfig()
  let response: Response
  try {
    response = await fetcher(`${bindings.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bindings.LLM_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: bindings.LLM_MODEL,
        messages: [
          { role: 'system', content: REPORT_PLATFORM_RULES },
          {
            role: 'user',
            content: JSON.stringify({
              fields: input.fields,
              reportingPrompt: input.reportingPrompt,
              userRequirement: input.userRequirement,
              componentProtocol,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'report_config', strict: true, schema: responseJsonSchema },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ReportLlmError('LLM_REQUEST_TIMEOUT', '报表配置请求超时')
    }
    throw new ReportLlmError('LLM_REQUEST_FAILED', '报表配置请求失败')
  }
  if (!response.ok) {
    throw new ReportLlmError('LLM_REQUEST_FAILED', `报表模型 HTTP 状态异常: ${response.status}`)
  }

  try {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('REPORT_CONFIG_MISSING')
    return ReportConfigSchema.parse(JSON.parse(content))
  } catch {
    throw new ReportLlmError('LLM_INVALID_REPORT_CONFIG', '模型响应不符合报表配置协议')
  }
}

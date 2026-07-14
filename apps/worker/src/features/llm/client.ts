import { ScriptDecisionSchema, type ScriptDecision } from '@data-analyze/contracts'

import type { ProcessingContext } from './prompt'
import { createLogger, type SafeLogger } from '../../lib/logger'
import { createFakeScriptDecision } from '../../testing/fake-llm'

export type LlmBindings = {
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_API_KEY: string
  ENVIRONMENT?: string
}

export class LlmClientError extends Error {
  constructor(
    readonly code: 'LLM_REQUEST_TIMEOUT' | 'LLM_REQUEST_FAILED' | 'LLM_INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
  }
}

const decisionJsonSchema = {
  type: 'object',
  required: [
    'supported',
    'scriptId',
    'scriptVersion',
    'parameters',
    'reason',
    'limitations',
  ],
  properties: {
    supported: { type: 'boolean' },
    scriptId: { type: ['string', 'null'] },
    scriptVersion: { type: ['string', 'null'] },
    parameters: { type: ['object', 'null'] },
    reason: { type: 'string' },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
} as const

/**
 * 调用兼容 Chat Completions 的统一模型端点；任何非协议响应都在 Worker 内终止。
 */
export async function requestScriptDecision(
  context: ProcessingContext,
  bindings: LlmBindings,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000,
  logger: SafeLogger = createLogger(),
): Promise<ScriptDecision> {
  if (bindings.ENVIRONMENT === 'test') return createFakeScriptDecision(context)
  const startedAt = Date.now()
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
          { role: 'system', content: context.platformRules },
          { role: 'user', content: JSON.stringify(context) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'script_decision', strict: true, schema: decisionJsonSchema },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.error('LLM 脚本决策请求超时', { errorCode: 'LLM_REQUEST_TIMEOUT', durationMs: Date.now() - startedAt })
      throw new LlmClientError('LLM_REQUEST_TIMEOUT', 'LLM 请求超时')
    }
    logger.error('LLM 脚本决策请求失败', { errorCode: 'LLM_REQUEST_FAILED', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_REQUEST_FAILED', 'LLM 请求失败')
  }

  if (!response.ok) {
    logger.error('LLM 脚本决策状态异常', { errorCode: 'LLM_REQUEST_FAILED', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_REQUEST_FAILED', `LLM HTTP 状态异常: ${response.status}`)
  }

  try {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (!content) throw new Error('LLM_CONTENT_MISSING')
    const decision = ScriptDecisionSchema.parse(JSON.parse(content))
    logger.info('LLM 脚本决策完成', { durationMs: Date.now() - startedAt })
    return decision
  } catch {
    logger.error('LLM 脚本决策协议无效', { errorCode: 'LLM_INVALID_RESPONSE', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_INVALID_RESPONSE', 'LLM 响应不符合脚本决策协议')
  }
}

import { describe, expect, it, vi } from 'vitest'

import { requestScriptDecision } from './client'

const context = {
  platformRules: '严格规则',
  dataset: { rowCount: 1, columnCount: 1, fields: [] },
  scripts: [],
  templatePrompt: '模板约束',
  userRequirement: '本次需求',
}

const llmEnv = {
  LLM_BASE_URL: 'https://llm.example.com/v1',
  LLM_MODEL: 'unified-model',
  LLM_API_KEY: 'secret',
}

function completion(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('requestScriptDecision', () => {
  it('校验并返回受支持的结构化决策', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      completion({
        supported: true,
        scriptId: 'sales-region-summary',
        scriptVersion: '1.0.0',
        parameters: { includeEmptyRegion: false },
        reason: '字段和需求匹配',
        limitations: [],
      }),
    )

    await expect(requestScriptDecision(context, llmEnv, fetcher)).resolves.toMatchObject({
      supported: true,
      scriptVersion: '1.0.0',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://llm.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('拒绝非 JSON 和不符合 Schema 的响应', async () => {
    await expect(
      requestScriptDecision(context, llmEnv, vi.fn<typeof fetch>().mockResolvedValue(completion('拒绝'))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
    await expect(
      requestScriptDecision(context, llmEnv, vi.fn<typeof fetch>().mockResolvedValue(completion({ supported: true }))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
  })

  it('区分超时和 HTTP 失败', async () => {
    const timeoutFetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'AbortError'))
    await expect(requestScriptDecision(context, llmEnv, timeoutFetcher)).rejects.toMatchObject({
      code: 'LLM_REQUEST_TIMEOUT',
    })

    const rejectedFetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('rejected', { status: 400 }))
    await expect(requestScriptDecision(context, llmEnv, rejectedFetcher)).rejects.toMatchObject({
      code: 'LLM_REQUEST_FAILED',
    })
  })

  it('接受模型明确返回的不支持决策', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      completion({
        supported: false,
        scriptId: null,
        scriptVersion: null,
        parameters: null,
        reason: '没有匹配脚本',
        limitations: ['缺少所需能力'],
      }),
    )
    await expect(requestScriptDecision(context, llmEnv, fetcher)).resolves.toMatchObject({
      supported: false,
    })
  })
})

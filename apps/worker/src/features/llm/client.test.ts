import { describe, expect, it, vi } from 'vitest'

import { requestAssetAnalysisConfig, requestCandidateScript, requestFieldDefinitions, requestScriptDecision } from './client'

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
    const request = fetcher.mock.calls[0]?.[1]
    expect(request).toEqual(expect.objectContaining({ method: 'POST' }))
    const payload = JSON.parse(String(request?.body))
    expect(payload.response_format).toEqual({ type: 'json_object' })
  })

  it('拒绝非 JSON 和不符合 Schema 的响应', async () => {
    await expect(
      requestScriptDecision(context, llmEnv, vi.fn<typeof fetch>().mockResolvedValue(completion('拒绝'))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
    await expect(
      requestScriptDecision(context, llmEnv, vi.fn<typeof fetch>().mockResolvedValue(completion({ supported: true }))),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
  })

  it('协议错误只记录安全失败原因，不记录模型原文', async () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    await expect(
      requestScriptDecision(
        context,
        llmEnv,
        vi.fn<typeof fetch>().mockResolvedValue(completion('不是 JSON')),
        15_000,
        logger,
      ),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
    expect(logger.error).toHaveBeenCalledWith(
      'LLM 脚本决策协议无效',
      expect.objectContaining({ failureReason: 'LLM_CONTENT_NOT_JSON' }),
    )
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

describe('requestAssetAnalysisConfig', () => {
  it('在本地诊断中保留无法解析的模型原文', async () => {
    const diagnostic = { info: vi.fn() }
    await expect(requestAssetAnalysisConfig(
      { requirement: '看趋势', assetName: '招聘表', fields: [{ name: '负责人', type: 'string' }], rowCount: 1 },
      llmEnv,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>upstream error</html>', { status: 200 })),
      diagnostic,
    )).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
    expect(diagnostic.info).toHaveBeenCalledWith('模型原始响应文本', '<html>upstream error</html>')
  })
})

describe('requestFieldDefinitions', () => {
  it('按表头返回可编辑的标准字段', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({
      fields: [{ sourceLabel: '销售额', name: 'sales_amount', type: 'number', required: true }],
    }))
    await expect(requestFieldDefinitions({ rowCount: 2, columnCount: 1, sheets: [], sourceFields: ['销售额'] }, llmEnv, '', fetcher)).resolves.toEqual([
      { sourceLabel: '销售额', name: 'sales_amount', type: 'number', required: true },
    ])
    const request = fetcher.mock.calls[0]?.[1]
    expect(request).toEqual(expect.objectContaining({ method: 'POST' }))
    const payload = JSON.parse(String(request?.body))
    expect(payload.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user' }),
    ]))
    expect(payload.messages[0].content).toContain('"fields"')
    expect(payload.messages[0].content).toContain('string | number | boolean | date')
    expect(payload.response_format).toEqual({ type: 'json_object' })
  })

  it('拒绝重复标准字段名', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({
      fields: [
        { sourceLabel: '金额', name: 'amount', type: 'number', required: false },
        { sourceLabel: '金额2', name: 'amount', type: 'number', required: false },
      ],
    }))
    await expect(requestFieldDefinitions({ rowCount: 2, columnCount: 1, sheets: [], sourceFields: ['金额'] }, llmEnv, '', fetcher)).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
  })

  it('记录字段协议校验失败的安全原因', async () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({
      fields: [{ sourceLabel: '销售额', name: 'sales_amount', type: 'decimal', required: true }],
    }))

    await expect(
      requestFieldDefinitions({ rowCount: 2, columnCount: 1, sheets: [], sourceFields: ['金额'] }, llmEnv, '', fetcher, 15_000, logger),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_RESPONSE' })
    expect(logger.error).toHaveBeenCalledWith(
      'LLM 标准字段协议无效',
      expect.objectContaining({ failureReason: 'FIELD_DEFINITION_INVALID' }),
    )
  })

  it('保留上游字段生成失败的安全错误信息', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'invalid_param', message: 'response_format 不受当前模型支持' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ))

    await expect(
      requestFieldDefinitions({ rowCount: 2, columnCount: 1, sheets: [], sourceFields: ['金额'] }, llmEnv, '', fetcher),
    ).rejects.toMatchObject({
      code: 'LLM_REQUEST_FAILED',
      message: 'LLM HTTP 状态异常: 400（invalid_param：response_format 不受当前模型支持）',
    })
  })

  it('非 JSON 上游错误不解析响应体且记录 HTTP 状态', async () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new Uint8Array([0, 1, 2]),
      { status: 403, headers: { 'content-type': 'application/octet-stream' } },
    ))

    await expect(
      requestFieldDefinitions({ rowCount: 2, columnCount: 1, sheets: [], sourceFields: ['金额'] }, llmEnv, '', fetcher, 15_000, logger),
    ).rejects.toMatchObject({ message: 'LLM HTTP 状态异常: 403' })
    expect(logger.error).toHaveBeenCalledWith(
      'LLM 标准字段状态异常',
      expect.objectContaining({ errorCode: 'LLM_REQUEST_FAILED', upstreamStatus: 403 }),
    )
  })
})

describe('requestCandidateScript', () => {
  it('记录候选代码上游失败的安全状态，不记录需求或模型原文', async () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('rate limited', { status: 429 }))

    await expect(
      requestCandidateScript(
        { id: 'custom-report', version: '0.1.0', requirement: '敏感需求', fields: [] },
        llmEnv,
        fetcher,
        30_000,
        logger,
      ),
    ).rejects.toMatchObject({ code: 'LLM_REQUEST_FAILED', message: 'LLM HTTP 状态异常: 429' })
    expect(logger.error).toHaveBeenCalledWith(
      'LLM 候选代码状态异常',
      expect.objectContaining({ errorCode: 'LLM_REQUEST_FAILED', upstreamStatus: 429 }),
    )
  })
})

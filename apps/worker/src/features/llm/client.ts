import {
  DatasetInspectionSchema,
  FieldDefinitionSchema,
  ScriptDecisionSchema,
  type DatasetInspection,
  type FieldDefinition,
  type ScriptDecision,
} from '@data-analyze/contracts'
import { z } from 'zod'

import type { ProcessingContext } from './prompt'
import { createLogger, type SafeLogger } from '../../lib/logger'
import { createFakeFieldDefinitions, createFakeScriptDecision } from '../../testing/fake-llm'

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

const AssetMetadataSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000),
  tags: z.array(z.string().trim().min(1).max(48)).max(12),
}).strict()

/**
 * 仅根据用户说明和资产控制面信息生成可编辑建议；调用边界不包含 R2 数据行。
 */
export async function requestAssetMetadataSuggestion(
  context: { name: string; templateName: string; rowCount: number; description: string },
  bindings: LlmBindings,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000,
  logger: SafeLogger = createLogger(),
) {
  if (bindings.ENVIRONMENT === 'test' || bindings.ENVIRONMENT === 'unit-test') {
    // 测试环境不访问外部模型，返回仍需由页面人工确认的确定性建议。
    return { name: context.name, description: context.description, tags: [] }
  }
  const rules = [
    '你是数据资产元数据助手。根据用户的说明生成可编辑的数据资产名称、说明与标签。',
    '元数据只用于帮助用户识别和筛选资产，不得描述或改变任何数据计算逻辑。',
    '不得臆造用户没有提供的人员、时间、班级等事实。',
    '只返回 JSON：{"name":"不超过120字","description":"不超过1000字","tags":["不超过12个标签"]}。',
  ].join('\n')
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetcher(`${bindings.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bindings.LLM_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: bindings.LLM_MODEL,
        messages: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify(context) }],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    logger.error('LLM 元数据建议请求失败', { errorCode: 'LLM_REQUEST_FAILED', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_REQUEST_FAILED', 'LLM 元数据建议请求失败')
  }
  if (!response.ok) {
    logger.error('LLM 元数据建议状态异常', { errorCode: 'LLM_REQUEST_FAILED', upstreamStatus: response.status, durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_REQUEST_FAILED', `LLM HTTP 状态异常: ${response.status}`)
  }
  try {
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const suggestion = AssetMetadataSuggestionSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content || ''))
    logger.info('LLM 元数据建议生成完成', { durationMs: Date.now() - startedAt, tagCount: suggestion.tags.length })
    return suggestion
  } catch {
    logger.error('LLM 元数据建议协议无效', { errorCode: 'LLM_INVALID_RESPONSE', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_INVALID_RESPONSE', 'LLM 元数据建议响应无效')
  }
}

type FieldProtocolFailureReason =
  | 'LLM_CONTENT_MISSING'
  | 'LLM_CONTENT_NOT_JSON'
  | 'FIELD_LIST_MISSING'
  | 'FIELD_LIST_EMPTY'
  | 'FIELD_DEFINITION_INVALID'
  | 'DUPLICATE_FIELD_NAME'
  | 'SOURCE_LABEL_MISMATCH'

class FieldProtocolError extends Error {
  constructor(readonly reason: FieldProtocolFailureReason) {
    super(reason)
  }
}

type ScriptDecisionFailureReason =
  | 'LLM_CONTENT_MISSING'
  | 'LLM_CONTENT_NOT_JSON'
  | 'SCRIPT_DECISION_INVALID'

export async function requestFieldDefinitions(
  inspection: DatasetInspection,
  bindings: LlmBindings,
  instruction = '',
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000,
  logger: SafeLogger = createLogger(),
): Promise<FieldDefinition[]> {
  const parsedInspection = DatasetInspectionSchema.parse(inspection)
  if (bindings.ENVIRONMENT === 'test') return createFakeFieldDefinitions(parsedInspection)

  const startedAt = Date.now()
  const platformRules = [
    '你是数据标准字段设计助手。只根据数据表的列名和规模生成业务标准字段。',
    'sourceLabel 必须逐字复制自输入 sourceFields，禁止翻译、改写或遗漏。',
    '字段 name 必须是稳定、简洁的英文 snake_case 标识。一个来源列只对应一个标准字段。',
    '必须为每个来源列生成一个字段，且只返回一个合法 JSON 对象，不要使用 Markdown 代码块。',
    '返回值必须严格为 {"fields":[{"sourceLabel":"原始表头","name":"english_snake_case","type":"string | number | boolean | date","required":true}]}。',
    'type 只能是 string、number、boolean、date 之一；required 必须是布尔值。',
  ].join('\n')
  const userInput = {
    inspection: parsedInspection,
    ...(instruction ? { instruction } : {}),
  }

  let response: Response
  try {
    response = await fetcher(`${bindings.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bindings.LLM_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: bindings.LLM_MODEL,
        messages: [
          { role: 'system', content: platformRules },
          { role: 'user', content: JSON.stringify(userInput) },
        ],
        // 当前模型不支持 json_schema；输出结构仍由后续 Zod 校验严格限制。
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch(error) {
    logger.error('LLM 标准字段请求失败', { errorCode: 'LLM_REQUEST_FAILED', durationMs: Date.now() - startedAt })
    throw new LlmClientError('LLM_REQUEST_FAILED', 'LLM 标准字段请求失败')
  }
  if (!response.ok) {
    const upstreamDetail = await readSafeUpstreamError(response)
    logger.error('LLM 标准字段状态异常', {
      errorCode: 'LLM_REQUEST_FAILED',
      upstreamStatus: response.status,
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError(
      'LLM_REQUEST_FAILED',
      `LLM HTTP 状态异常: ${response.status}${upstreamDetail ? `（${upstreamDetail}）` : ''}`,
    )
  }
  try {
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content
    const parsed = parseFieldDefinitionsContent(content, parsedInspection.sourceFields)
    logger.info('LLM 标准字段生成完成', { durationMs: Date.now() - startedAt, fieldCount: parsed.length })
    return parsed
  } catch (error) {
    const failureReason = error instanceof FieldProtocolError ? error.reason : 'FIELD_DEFINITION_INVALID'
    logger.error('LLM 标准字段协议无效', {
      errorCode: 'LLM_INVALID_RESPONSE',
      failureReason,
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError('LLM_INVALID_RESPONSE', 'LLM 响应不符合标准字段协议')
  }
}

/** 为人工审核准备候选源码；调用方仍需显式确认才会请求 GitHub 创建 PR。 */
export async function requestCandidateScript(
  context: { id: string; version: string; requirement: string; fields: unknown[] },
  bindings: LlmBindings,
  fetcher: typeof fetch = fetch,
  timeoutMs = 30_000,
  logger: SafeLogger = createLogger(),
): Promise<{ source: string; rationale: string }> {
  const rules = [
    '生成一个 TypeScript 候选脚本，只使用以下字段和 @data-analyze/script-sdk。',
    '必须导出 export const script，并在 metadata 中使用指定 id、version。',
    '不要访问网络、环境变量、R2、D1，不要发明字段。',
    '只返回 JSON：{"source":"完整 TypeScript 源码","rationale":"中文简要说明"}。',
  ].join('\n')
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetcher(`${bindings.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bindings.LLM_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: bindings.LLM_MODEL,
        messages: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify(context) }],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.error('LLM 候选代码请求超时', {
        errorCode: 'LLM_REQUEST_TIMEOUT',
        durationMs: Date.now() - startedAt,
      })
      throw new LlmClientError('LLM_REQUEST_TIMEOUT', 'LLM 候选代码请求超时')
    }
    logger.error('LLM 候选代码请求失败', {
      errorCode: 'LLM_REQUEST_FAILED',
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError('LLM_REQUEST_FAILED', 'LLM 候选脚本请求失败')
  }
  if (!response.ok) {
    logger.error('LLM 候选代码状态异常', {
      errorCode: 'LLM_REQUEST_FAILED',
      upstreamStatus: response.status,
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError('LLM_REQUEST_FAILED', `LLM HTTP 状态异常: ${response.status}`)
  }
  try {
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content
    return z.object({ source: z.string().min(1), rationale: z.string().min(1) }).parse(JSON.parse(content || ''))
  } catch {
    logger.error('LLM 候选代码协议无效', {
      errorCode: 'LLM_INVALID_RESPONSE',
      failureReason: 'CANDIDATE_RESPONSE_INVALID',
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError('LLM_INVALID_RESPONSE', 'LLM 候选脚本响应无效')
  }
}

/** 将模型 JSON 转为受协议约束的字段定义，日志仅保留原因枚举，不记录模型原文或表头。 */
function parseFieldDefinitionsContent(
  content: string | undefined,
  sourceFields: string[],
): FieldDefinition[] {
  if (!content) throw new FieldProtocolError('LLM_CONTENT_MISSING')

  let payload: unknown
  try {
    payload = JSON.parse(content)
  } catch {
    throw new FieldProtocolError('LLM_CONTENT_NOT_JSON')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('fields' in payload)) {
    throw new FieldProtocolError('FIELD_LIST_MISSING')
  }

  const fields = payload.fields
  if (!Array.isArray(fields)) throw new FieldProtocolError('FIELD_LIST_MISSING')
  if (!fields.length) throw new FieldProtocolError('FIELD_LIST_EMPTY')

  let parsed: FieldDefinition[]
  try {
    parsed = fields.map((field) => FieldDefinitionSchema.parse(field))
  } catch {
    throw new FieldProtocolError('FIELD_DEFINITION_INVALID')
  }
  if (new Set(parsed.map((field) => field.name)).size !== parsed.length) {
    throw new FieldProtocolError('DUPLICATE_FIELD_NAME')
  }
  // 只接受逐字对应的原始表头，避免模型另造中文名造成上传后无法自动匹配。
  if (
    parsed.length !== sourceFields.length ||
    new Set(parsed.map((field) => field.sourceLabel)).size !== parsed.length ||
    parsed.some((field) => !sourceFields.includes(field.sourceLabel))
  ) {
    throw new FieldProtocolError('SOURCE_LABEL_MISMATCH')
  }
  return parsed
}

/** 仅提取上游错误码和短消息，避免将请求内容或未知 JSON 直接暴露给页面。 */
async function readSafeUpstreamError(response: Response) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) return ''
  const body = await response.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('error' in body)) return ''
  const error = body.error
  if (!error || typeof error !== 'object' || Array.isArray(error)) return ''
  const code = typeof error.code === 'string' ? sanitizeUpstreamErrorPart(error.code, 80) : ''
  const message = typeof error.message === 'string' ? sanitizeUpstreamErrorPart(error.message, 240) : ''
  if (code && message) return `${code}：${message}`
  return code || message
}

function sanitizeUpstreamErrorPart(value: string, maxLength: number) {
  return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLength)
}

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
        // 当前模型不支持 json_schema；输出结构仍由后续 Zod 校验严格限制。
        response_format: { type: 'json_object' },
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
    const decision = parseScriptDecisionContent(content)
    logger.info('LLM 脚本决策完成', { durationMs: Date.now() - startedAt })
    return decision
  } catch (error) {
    const failureReason = error instanceof ScriptDecisionProtocolError
      ? error.reason
      : 'SCRIPT_DECISION_INVALID'
    logger.error('LLM 脚本决策协议无效', {
      errorCode: 'LLM_INVALID_RESPONSE',
      failureReason,
      durationMs: Date.now() - startedAt,
    })
    throw new LlmClientError('LLM_INVALID_RESPONSE', 'LLM 响应不符合脚本决策协议')
  }
}

class ScriptDecisionProtocolError extends Error {
  constructor(readonly reason: ScriptDecisionFailureReason) {
    super(reason)
  }
}

/** 仅输出枚举化失败原因，避免日志泄露模型回显的业务内容。 */
function parseScriptDecisionContent(content: string | undefined): ScriptDecision {
  if (!content) throw new ScriptDecisionProtocolError('LLM_CONTENT_MISSING')
  let payload: unknown
  try {
    payload = JSON.parse(content)
  } catch {
    throw new ScriptDecisionProtocolError('LLM_CONTENT_NOT_JSON')
  }
  try {
    return ScriptDecisionSchema.parse(payload)
  } catch {
    throw new ScriptDecisionProtocolError('SCRIPT_DECISION_INVALID')
  }
}

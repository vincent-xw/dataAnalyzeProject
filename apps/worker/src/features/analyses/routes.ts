import { ReportConfigSchema, type ReportConfig, validateReportReferences } from '@data-analyze/report-schema'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../../index'
import { LlmClientError, requestAnalysisFailureGuidance, requestAssetAnalysisConfig } from '../llm/client'
import { AnalysisService, type FailureGuidance } from './service'
import { SystemPromptService } from '../settings/service'
import { createLogger, createSensitiveDebugLogger } from '../../lib/logger'

const RequestSchema = z.object({ requirement: z.string().trim().min(1).max(1_000), assetIds: z.array(z.string().uuid()).min(1).max(20), primaryAssetId: z.string().uuid() }).strict()
class AnalysisConfigError extends Error {}
export const analysisRoutes = new Hono<Env>()
analysisRoutes.get('/', async (c) => c.json(await new AnalysisService(c.env).list()))
analysisRoutes.post('/', async (c) => {
  const startedAt = Date.now(); const logger = createLogger({ requestId: c.get('requestId'), category: 'analysis', operation: 'create_analysis' })
  const diagnostic = createSensitiveDebugLogger(c.env, undefined, { requestId: c.get('requestId'), category: 'analysis', operation: 'create_analysis_debug' })
  const request = RequestSchema.safeParse(await c.req.json().catch(() => null)); if (!request.success || !request.data.assetIds.includes(request.data.primaryAssetId) || new Set(request.data.assetIds).size !== request.data.assetIds.length) { logger.error('分析创建请求无效', { errorCode: 'INVALID_ANALYSIS_ASSETS', failureReason: 'INVALID_ASSET_SELECTION', durationMs: Date.now() - startedAt }); return c.json({ code: 'INVALID_ANALYSIS_ASSETS', message: '请至少选择一张数据表，并从中指定主表' }, 400) }
  logger.info('分析创建开始', { assetCount: request.data.assetIds.length })
  diagnostic?.info('分析创建原始请求', request.data)
  const service = new AnalysisService(c.env); const contextStartedAt = Date.now(); const context = await service.assetContext(request.data.primaryAssetId); if (!context) { logger.error('分析主表上下文不存在', { errorCode: 'ASSET_NOT_FOUND', failureReason: 'PRIMARY_ASSET_CONTEXT_MISSING', durationMs: Date.now() - contextStartedAt }); return c.json({ code: 'ASSET_NOT_FOUND', message: '主数据表不存在' }, 404) }
  logger.info('分析主表上下文读取完成', { stage: 'primary_asset_context', rowCount: context.asset.row_count, columnCount: context.fields.length, byteSize: context.byteSize, durationMs: Date.now() - contextStartedAt })
  const assetsStartedAt = Date.now(); const assets = await Promise.all(request.data.assetIds.map((id) => service.assetContext(id))); if (assets.some((asset) => !asset)) { logger.error('分析关联表上下文不存在', { errorCode: 'ASSET_NOT_FOUND', failureReason: 'REFERENCE_ASSET_CONTEXT_MISSING', assetCount: request.data.assetIds.length, durationMs: Date.now() - assetsStartedAt }); return c.json({ code: 'ASSET_NOT_FOUND', message: '存在不可用的数据表' }, 404) }
  logger.info('分析关联表上下文读取完成', { stage: 'all_asset_contexts', assetCount: request.data.assetIds.length, durationMs: Date.now() - assetsStartedAt })
  const prompt = await new SystemPromptService(c.env).current(); if (!prompt) return c.json({ code: 'SYSTEM_PROMPT_MISSING', message: '分析系统提示词未初始化' }, 500)
  let config: ReportConfig
  try {
    const llmStartedAt = Date.now(); const llmContext = { requirement: request.data.requirement, assetName: context.asset.name, fields: context.fields, rowCount: context.asset.row_count }
    diagnostic?.info('模型原始输入', llmContext); logger.info('分析规则模型请求开始', { category: 'llm', modelName: c.env.LLM_MODEL })
    config = ReportConfigSchema.parse(await requestAssetAnalysisConfig(llmContext, c.env, undefined, diagnostic ?? undefined, undefined, prompt.content))
    diagnostic?.info('模型解析后规则', config); logger.info('分析规则模型请求完成', { category: 'llm', modelName: c.env.LLM_MODEL, widgetCount: config.widgets.length, filterCount: config.filters.length, durationMs: Date.now() - llmStartedAt })
    const validationStartedAt = Date.now(); const issues = validateReportReferences(config, context.fields as never, { rowCount: context.asset.row_count, byteSize: context.byteSize })
    if (issues.length) throw new AnalysisConfigError(issues[0]?.code || 'ANALYSIS_CONFIG_INVALID')
    logger.info('分析规则校验通过', { stage: 'config_validation', widgetCount: config.widgets.length, filterCount: config.filters.length, durationMs: Date.now() - validationStartedAt })
  } catch (error) {
    const reason = error instanceof Error ? error.message : '分析规则不符合约束'
    const diagnosable = error instanceof AnalysisConfigError || error instanceof LlmClientError && error.code === 'LLM_INVALID_RESPONSE'
    let guidance: FailureGuidance | null = null
    if (diagnosable) {
      const guidanceStartedAt = Date.now()
      try { logger.info('分析失败诊断模型请求开始', { category: 'llm', stage: 'failure_guidance', modelName: c.env.LLM_MODEL }); guidance = await requestAnalysisFailureGuidance({ requirement: request.data.requirement, assetName: context.asset.name, fields: context.fields, failureReason: reason }, c.env, undefined, diagnostic ?? undefined); logger.info('分析失败诊断模型请求完成', { category: 'llm', stage: 'failure_guidance', durationMs: Date.now() - guidanceStartedAt }) } catch (guidanceError) { logger.error('分析失败诊断模型不可用', { category: 'llm', stage: 'failure_guidance', errorCode: guidanceError instanceof LlmClientError ? guidanceError.code : 'LLM_REQUEST_FAILED', failureReason: guidanceError instanceof Error ? guidanceError.message : 'UNKNOWN', durationMs: Date.now() - guidanceStartedAt }) }
    }
    try { const failed = await service.create(request.data.assetIds, request.data.primaryAssetId, request.data.requirement, c.get('authenticatedUser').email, null, reason, prompt.id, guidance); logger.info('失败分析记录已保存', { category: 'storage', stage: 'd1_failed_analysis_insert', assetCount: request.data.assetIds.length, durationMs: Date.now() - startedAt }); return c.json({ code: 'ANALYSIS_CONFIG_INVALID', message: reason, analysisId: failed?.id, guidance }, 422) } catch (storageError) { logger.error('失败分析记录写入失败', { category: 'storage', stage: 'd1_failed_analysis_insert', errorCode: 'D1_WRITE_FAILED', failureReason: storageError instanceof Error ? storageError.message : 'UNKNOWN', durationMs: Date.now() - startedAt, status: 503 }); return c.json({ code: 'D1_WRITE_FAILED', message: '分析失败记录保存失败，请稍后重试' }, 503) }
  }
  try { const saveStartedAt = Date.now(); const analysis = await service.create(request.data.assetIds, request.data.primaryAssetId, request.data.requirement, c.get('authenticatedUser').email, config, null, prompt.id); logger.info('分析记录创建完成', { category: 'storage', stage: 'd1_analysis_insert', assetCount: request.data.assetIds.length, durationMs: Date.now() - saveStartedAt }); return c.json(analysis, 201) } catch (error) { logger.error('分析记录写入失败', { category: 'storage', stage: 'd1_analysis_insert', errorCode: 'D1_WRITE_FAILED', failureReason: error instanceof Error ? error.message : 'UNKNOWN', durationMs: Date.now() - startedAt, status: 503 }); return c.json({ code: 'D1_WRITE_FAILED', message: '分析记录保存失败，请稍后重试' }, 503) }
})
analysisRoutes.get('/:analysisId', async (c) => { const detail = await new AnalysisService(c.env).detailWithRows(c.req.param('analysisId')); return detail ? c.json(detail) : c.json({ code: 'ANALYSIS_NOT_FOUND', message: '分析记录不存在' }, 404) })

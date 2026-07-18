import { ReportConfigSchema, validateReportReferences } from '@data-analyze/report-schema'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../../index'
import { LlmClientError, requestAssetAnalysisConfig } from '../llm/client'
import { AnalysisService } from './service'

const RequestSchema = z.object({ requirement: z.string().trim().min(1).max(1_000), assetIds: z.array(z.string().uuid()).min(1).max(20), primaryAssetId: z.string().uuid() }).strict()
export const analysisRoutes = new Hono<Env>()
analysisRoutes.get('/', async (c) => c.json(await new AnalysisService(c.env).list()))
analysisRoutes.post('/', async (c) => {
  const request = RequestSchema.safeParse(await c.req.json().catch(() => null)); if (!request.success || !request.data.assetIds.includes(request.data.primaryAssetId) || new Set(request.data.assetIds).size !== request.data.assetIds.length) return c.json({ code: 'INVALID_ANALYSIS_ASSETS', message: '请至少选择一张数据表，并从中指定主表' }, 400)
  const service = new AnalysisService(c.env); const context = await service.assetContext(request.data.primaryAssetId); if (!context) return c.json({ code: 'ASSET_NOT_FOUND', message: '主数据表不存在' }, 404)
  const assets = await Promise.all(request.data.assetIds.map((id) => service.assetContext(id))); if (assets.some((asset) => !asset)) return c.json({ code: 'ASSET_NOT_FOUND', message: '存在不可用的数据表' }, 404)
  try { const config = ReportConfigSchema.parse(await requestAssetAnalysisConfig({ requirement: request.data.requirement, assetName: context.asset.name, fields: context.fields, rowCount: context.asset.row_count }, c.env)); const issues = validateReportReferences(config, context.fields as never, { rowCount: context.asset.row_count, byteSize: context.byteSize }); if (issues.length) throw new Error(issues[0]?.code || 'ANALYSIS_CONFIG_INVALID'); return c.json(await service.create(request.data.assetIds, request.data.primaryAssetId, request.data.requirement, c.get('authenticatedUser').email, config, null), 201) } catch (error) { const reason = error instanceof LlmClientError ? error.message : error instanceof Error ? error.message : '分析规则不符合约束'; const failed = await service.create(request.data.assetIds, request.data.primaryAssetId, request.data.requirement, c.get('authenticatedUser').email, null, reason); return c.json({ code: 'ANALYSIS_CONFIG_INVALID', message: reason, analysisId: failed?.id }, 422) }
})
analysisRoutes.get('/:analysisId', async (c) => { const detail = await new AnalysisService(c.env).detailWithRows(c.req.param('analysisId')); return detail ? c.json(detail) : c.json({ code: 'ANALYSIS_NOT_FOUND', message: '分析记录不存在' }, 404) })

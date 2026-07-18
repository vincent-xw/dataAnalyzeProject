import { ReportConfigSchema, validateReportReferences } from '@data-analyze/report-schema'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../../index'
import { LlmClientError, requestAssetAnalysisConfig } from '../llm/client'
import { AnalysisService } from './service'

const RequestSchema = z.object({ requirement: z.string().trim().min(1).max(1_000) }).strict()
export const analysisRoutes = new Hono<Env>()
analysisRoutes.get('/:assetId/analyses', async (c) => { const s = new AnalysisService(c.env); if (!await s.assetContext(c.req.param('assetId'))) return c.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404); return c.json(await s.list(c.req.param('assetId'))) })
analysisRoutes.post('/:assetId/analyses', async (c) => {
  const request = RequestSchema.safeParse(await c.req.json().catch(() => null)); if (!request.success) return c.json({ code: 'INVALID_ANALYSIS_REQUIREMENT', message: '请填写分析需求' }, 400)
  const s = new AnalysisService(c.env); const context = await s.assetContext(c.req.param('assetId')); if (!context) return c.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404)
  try {
    const config = ReportConfigSchema.parse(await requestAssetAnalysisConfig({ requirement: request.data.requirement, assetName: context.asset.name, fields: context.fields, rowCount: context.asset.row_count }, c.env))
    const issues = validateReportReferences(config, context.fields as never, { rowCount: context.asset.row_count, byteSize: context.byteSize }); if (issues.length) throw new Error(issues[0]?.code || 'ANALYSIS_CONFIG_INVALID')
    return c.json(await s.create(context.asset.id, request.data.requirement, c.get('authenticatedUser').email, config, null), 201)
  } catch (error) {
    const reason = error instanceof LlmClientError ? error.message : error instanceof Error ? error.message : '分析规则不符合约束'
    await s.create(context.asset.id, request.data.requirement, c.get('authenticatedUser').email, null, reason)
    return c.json({ code: 'ANALYSIS_CONFIG_INVALID', message: reason }, 422)
  }
})
analysisRoutes.get('/:assetId/analyses/:analysisId', async (c) => { const detail = await new AnalysisService(c.env).detailWithRows(c.req.param('assetId'), c.req.param('analysisId')); return detail ? c.json(detail) : c.json({ code: 'ANALYSIS_NOT_FOUND', message: '分析记录不存在' }, 404) })

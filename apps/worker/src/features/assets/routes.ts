import { Hono } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { LlmClientError, requestAssetMetadataSuggestion } from '../llm/client'
import { AssetService, AssetServiceError } from './service'

const AssetMetadataSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000).nullable(),
  tags: z.array(z.string().trim().min(1).max(48)).max(12),
}).strict()

const MetadataSuggestionRequestSchema = z.object({
  description: z.string().trim().min(1).max(1_000),
}).strict()

export const assetRoutes = new Hono<Env>()

assetRoutes.get('/', async (context) => {
  return context.json(await new AssetService(context.env).list())
})

assetRoutes.get('/:id/preview', async (context) => {
  try {
    const preview = await new AssetService(context.env).preview(context.req.param('id'))
    if (!preview) return context.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404)
    return context.json(preview)
  } catch (error) {
    if (error instanceof AssetServiceError) return context.json({ code: error.code, message: error.message }, error.status)
    throw error
  }
})

assetRoutes.get('/:id', async (context) => {
  const asset = await new AssetService(context.env).get(context.req.param('id'))
  if (!asset) return context.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404)
  return context.json(asset)
})

assetRoutes.put('/:id/metadata', async (context) => {
  const request = AssetMetadataSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) return context.json({ code: 'INVALID_ASSET_METADATA', message: '元数据格式不正确' }, 400)
  const asset = await new AssetService(context.env).updateMetadata(context.req.param('id'), request.data)
  if (!asset) return context.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404)
  return context.json(asset)
})

assetRoutes.post('/:id/metadata-suggestions', async (context) => {
  const request = MetadataSuggestionRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) return context.json({ code: 'INVALID_METADATA_DESCRIPTION', message: '请填写元数据说明' }, 400)
  const asset = await new AssetService(context.env).get(context.req.param('id'))
  if (!asset) return context.json({ code: 'ASSET_NOT_FOUND', message: '数据资产不存在' }, 404)
  try {
    // 模型仅接收控制面信息与用户描述，不接触 R2 中的任意数据行。
    return context.json(await requestAssetMetadataSuggestion({
      name: asset.name,
      templateName: asset.templateName,
      rowCount: asset.rowCount,
      description: request.data.description,
    }, context.env))
  } catch (error) {
    if (error instanceof LlmClientError) return context.json({ code: error.code, message: error.message }, 502)
    throw error
  }
})

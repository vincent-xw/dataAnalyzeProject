import { Hono } from 'hono'
import { z } from 'zod'
import { parse } from 'csv-parse/sync'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

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

assetRoutes.post('/upload', async (context) => {
  const fileName = context.req.header('x-file-name')
  const isXlsx = context.req.header('content-type') === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const encoding = context.req.header('x-csv-encoding')
  const delimiter = context.req.header('x-csv-delimiter')
  if (!fileName || !isXlsx && (!encoding || !delimiter)) {
    return context.json({ code: 'INVALID_UPLOAD', message: 'CSV 上传参数不完整' }, 400)
  }
  const content = await context.req.arrayBuffer()
  const selectedSheet = context.req.header('x-selected-sheet') ? decodeURIComponent(context.req.header('x-selected-sheet')!) : undefined
  const rows = isXlsx
    ? readXlsxRows(content, selectedSheet)
    : parse(iconv.decode(new Uint8Array(content), encoding === 'gb18030' ? 'gb18030' : 'utf-8').replace(/^\uFEFF/, ''), { delimiter, skip_empty_lines: true }) as string[][]
  if (!Array.isArray(rows)) return context.json({ status: 'awaiting_sheet', sheets: rows.sheets })
  const [header, ...values] = rows
  if (!header || header.length === 0 || header.some((field) => !field.trim()) || new Set(header).size !== header.length) {
    return context.json({ code: 'INVALID_HEADER', message: 'CSV 表头不能为空且不能重复' }, 422)
  }
  const sourceFields = header.map((field) => field.trim())
  const records = values.map((row) => Object.fromEntries(sourceFields.map((field, index) => [field, row[index] ?? ''])))
  const assetId = crypto.randomUUID()
  const prefix = `data-analyze/assets/${assetId}`
  const now = new Date().toISOString()
  const name = decodeURIComponent(fileName).replace(/\.[^.]+$/, '')
  const dataKey = `${prefix}/data/data.ndjson`
  const schemaKey = `${prefix}/schema.json`
  const previewKey = `${prefix}/preview.json`
  await context.env.DATA_BUCKET.put(dataKey, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''))
  await context.env.DATA_BUCKET.put(schemaKey, JSON.stringify(sourceFields.map((field) => ({ sourceLabel: field, name: field, type: 'string', required: false }))))
  await context.env.DATA_BUCKET.put(previewKey, JSON.stringify(records.slice(0, 50)))
  await context.env.DB.prepare(
    `INSERT INTO data_assets (id, kind, name, description, tags_json, data_object_key, schema_object_key, preview_object_key, row_count, status, created_by, created_at, updated_at)
     VALUES (?, 'source', ?, NULL, '[]', ?, ?, ?, ?, 'ready', ?, ?, ?)`,
  ).bind(assetId, name, dataKey, schemaKey, previewKey, records.length, context.get('authenticatedUser').email, now, now).run()
  return context.json(await new AssetService(context.env).get(assetId), 201)
})

function readXlsxRows(content: ArrayBuffer, selectedSheet?: string): string[][] | { sheets: string[] } {
  const workbook = XLSX.read(content, { dense: true })
  if (!selectedSheet) return { sheets: workbook.SheetNames }
  const worksheet = workbook.Sheets[selectedSheet]
  if (!worksheet) throw new Error('UNKNOWN_SHEET')
  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false }).map((row) => row.map(String))
}

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
      rowCount: asset.rowCount,
      description: request.data.description,
    }, context.env))
  } catch (error) {
    if (error instanceof LlmClientError) return context.json({ code: error.code, message: error.message }, 502)
    throw error
  }
})

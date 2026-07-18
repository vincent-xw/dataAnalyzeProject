import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { authenticatedRequest } from '../../testing/request'

const assetId = 'a0000000-0000-4000-8000-000000000003'
const otherAssetId = 'a0000000-0000-4000-8000-000000000004'
const dataKey = `data-analyze/assets/${assetId}/data.ndjson`
const schemaKey = `data-analyze/assets/${assetId}/schema.json`

describe('数据资产分析 API', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM analysis_data_assets'),
      env.DB.prepare('DELETE FROM analyses'),
      env.DB.prepare('DELETE FROM data_assets'),
      env.DB.prepare(
        `INSERT INTO data_assets
          (id, kind, name, description, tags_json, data_object_key, schema_object_key,
           row_count, status, created_by, created_at, updated_at)
         VALUES (?, 'source', '三年二班期中成绩', NULL, '[]', ?, ?, 2, 'ready', 'teacher@example.com', ?, ?)`,
      ).bind(assetId, dataKey, schemaKey, new Date().toISOString(), new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO data_assets
          (id, kind, name, description, tags_json, data_object_key, schema_object_key,
           row_count, status, created_by, created_at, updated_at)
         VALUES (?, 'source', '另一份成绩', NULL, '[]', 'other.ndjson', 'other.json', 0, 'ready', 'teacher@example.com', ?, ?)`,
      ).bind(otherAssetId, new Date().toISOString(), new Date().toISOString()),
    ])
    await env.DATA_BUCKET.put(dataKey, '{"student_name":"张三","total_score":178}\n{"student_name":"李四","total_score":174}\n')
    await env.DATA_BUCKET.put(schemaKey, JSON.stringify([
      { sourceLabel: '姓名', name: 'student_name', type: 'string', required: false },
      { sourceLabel: '总成绩', name: 'total_score', type: 'string', required: false },
    ]))
  })

  it('创建经校验的分析并在资产历史中返回它', async () => {
    const created = await authenticatedRequest('/api/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: '按姓名展示总成绩', assetIds: [assetId], primaryAssetId: assetId }),
    }, env)

    expect(created.status).toBe(201)
    expect(await created.json()).toEqual(expect.objectContaining({
      requirement: '按姓名展示总成绩',
      status: 'ready',
      config: expect.objectContaining({ widgets: expect.any(Array) }),
    }))

    const listed = await authenticatedRequest('/api/analyses', {}, env)
    expect(await listed.json()).toEqual([expect.objectContaining({
      requirement: '按姓名展示总成绩', status: 'ready',
    })])
  })

  it('返回冻结的规则和用于渲染的数据行，并禁止跨资产访问', async () => {
    const created = await authenticatedRequest('/api/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: '按姓名展示总成绩', assetIds: [assetId], primaryAssetId: assetId }),
    }, env)
    const { id } = await created.json() as { id: string }

    const detail = await authenticatedRequest(`/api/analyses/${id}`, {}, env)
    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual(expect.objectContaining({
      id,
      config: expect.objectContaining({ title: expect.any(String) }),
      rows: [{ student_name: '张三', total_score: 178 }, { student_name: '李四', total_score: 174 }],
    }))

    expect((await authenticatedRequest(`/api/analyses/${crypto.randomUUID()}`, {}, env)).status).toBe(404)
  })

  it('以明确原因记录模型生成失败的分析', async () => {
    const response = await authenticatedRequest('/api/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement: '不支持的分析需求', assetIds: [assetId], primaryAssetId: assetId }),
    }, env)

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(expect.objectContaining({
      code: 'ANALYSIS_CONFIG_INVALID',
      guidance: {
        summary: expect.any(String),
        suggestion: expect.any(String),
        revisedRequirement: expect.any(String),
      },
    }))
    const listed = await authenticatedRequest('/api/analyses', {}, env)
    expect(await listed.json()).toEqual([expect.objectContaining({ status: 'failed', failureReason: expect.any(String) })])
  })
})

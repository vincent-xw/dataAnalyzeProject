import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { authenticatedRequest } from '../../testing/request'

const assetId = 'a0000000-0000-4000-8000-000000000002'
const dataKey = `data-analyze/assets/${assetId}/data.ndjson`
const schemaKey = `data-analyze/assets/${assetId}/schema.json`

describe('数据资产 API', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM data_assets'),
      env.DB.prepare(
        `INSERT INTO data_assets
          (id, kind, name, description, tags_json, data_object_key, schema_object_key,
           row_count, status, created_by, created_at, updated_at)
         VALUES (?, 'source', '三年二班期中成绩', '王老师的期中成绩', ?, ?, ?, 2, 'ready', 'teacher@example.com', ?, ?)`,
      ).bind(assetId, JSON.stringify(['王老师', '期中考试']), dataKey, schemaKey, new Date().toISOString(), new Date().toISOString()),
    ])
    await env.DATA_BUCKET.put(dataKey, '{"student_name":"张三","total_score":178}\n{"student_name":"李四","total_score":174}\n')
    await env.DATA_BUCKET.put(schemaKey, JSON.stringify([
      { sourceLabel: '姓名', name: 'student_name', type: 'string', required: true },
      { sourceLabel: '总成绩', name: 'total_score', type: 'number', required: true },
    ]))
  })

  it('按创建时间返回可识别的数据资产列表', async () => {
    const response = await authenticatedRequest('/api/assets', {}, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({
      id: assetId,
      name: '三年二班期中成绩',
      kind: 'source',
      tags: ['王老师', '期中考试'],
      rowCount: 2,
    })])
  })

  it('直接上传 CSV 后创建可预览的无模板 NDJSON 资产', async () => {
    const content = '姓名,总成绩\n张三,178\n李四,174\n'
    const response = await authenticatedRequest('/api/assets/upload', {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'x-file-name': encodeURIComponent('期中成绩.csv'),
        'x-csv-encoding': 'utf-8',
        'x-csv-delimiter': ',',
      },
      body: content,
    }, env)

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      name: '期中成绩',
      kind: 'source',
      rowCount: 2,
    })
  })

  it('只返回前 50 行标准化数据作为预览', async () => {
    const response = await authenticatedRequest(`/api/assets/${assetId}/preview`, {}, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      rowCount: 2,
      rows: [
        { student_name: '张三', total_score: 178 },
        { student_name: '李四', total_score: 174 },
      ],
    })
  })

  it('保存人工确认的识别元数据，不改变资产数据', async () => {
    const response = await authenticatedRequest(`/api/assets/${assetId}/metadata`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '2026 春季学期三年二班期中成绩',
        description: '王老师录入，供本学期成绩跟踪使用。',
        tags: ['王老师', '三年二班', '2026 春季'],
      }),
    }, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      id: assetId,
      name: '2026 春季学期三年二班期中成绩',
      tags: ['王老师', '三年二班', '2026 春季'],
    }))
  })

  it('根据用户的自然语言描述建议元数据，但不读取数据行', async () => {
    const response = await authenticatedRequest(`/api/assets/${assetId}/metadata-suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '这是王老师在 2026 春季学期为三年二班录入的期中成绩。' }),
    }, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      name: expect.any(String),
      description: expect.any(String),
      tags: expect.any(Array),
    }))
  })
})

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { authenticatedRequest } from '../../testing/request'

const templateId = '00000000-0000-4000-8000-000000000001'
const datasetId = '00000000-0000-4000-8000-000000000002'
const versionId = '00000000-0000-4000-8000-000000000003'
const schemaObjectKey = `data-analyze/datasets/${datasetId}/${versionId}/schema/inspection.json`

describe('字段映射 API', () => {
  beforeEach(async () => {
    // 固定测试夹具只描述已完成结构检查的数据集，不为缺失字段提供隐式默认值。
    await env.DB.batch([
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
      env.DB.prepare(
        `INSERT INTO analysis_templates
          (id, name, description, input_schema_json, created_at, updated_at)
         VALUES (?, '销售分析', '字段映射测试', ?, ?, ?)`,
      ).bind(
        templateId,
        JSON.stringify([
          { name: 'salesAmount', type: 'number', description: '销售额', required: true },
          { name: 'region', type: 'string', description: '区域', required: false },
        ]),
        new Date().toISOString(),
        new Date().toISOString(),
      ),
      env.DB.prepare(
        "INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, 'sales.csv', ?)",
      ).bind(datasetId, templateId, new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO dataset_versions
          (id, dataset_id, source_object_key, schema_object_key, file_type,
           row_count, column_count, validation_status, created_at)
         VALUES (?, ?, ?, ?, 'csv', 1, 2, 'inspected', ?)`,
      ).bind(
        versionId,
        datasetId,
        `data-analyze/datasets/${datasetId}/${versionId}/source/original.csv`,
        schemaObjectKey,
        new Date().toISOString(),
      ),
    ])
    await env.DATA_BUCKET.put(
      schemaObjectKey,
      JSON.stringify({ rowCount: 1, columnCount: 2, sheets: [], sourceFields: ['销售额', '区域'] }),
    )
  })

  it('缺少必填字段时拒绝保存', async () => {
    const response = await authenticatedRequest(
      `/api/datasets/${versionId}/mapping`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ sourceField: '区域', targetField: 'region' }]),
      },
      env,
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ missingRequired: ['salesAmount'] })
  })

  it('保存一一映射并将版本状态更新为 mapped', async () => {
    const response = await authenticatedRequest(
      `/api/datasets/${versionId}/mapping`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { sourceField: '销售额', targetField: 'salesAmount' },
          { sourceField: '区域', targetField: 'region' },
        ]),
      },
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'mapped', mappingCount: 2 })
    expect(
      await env.DB.prepare('SELECT validation_status FROM dataset_versions WHERE id = ?')
        .bind(versionId)
        .first(),
    ).toMatchObject({ validation_status: 'mapped' })
  })
})

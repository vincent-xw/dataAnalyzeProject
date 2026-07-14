import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authenticatedRequest } from '../../testing/request'

const templateId = '40000000-0000-4000-8000-000000000001'
const processingPromptId = '40000000-0000-4000-8000-000000000002'
const reportingPromptId = '40000000-0000-4000-8000-000000000003'
const datasetId = '40000000-0000-4000-8000-000000000004'
const versionId = '40000000-0000-4000-8000-000000000005'
const planId = '40000000-0000-4000-8000-000000000006'
const taskId = '40000000-0000-4000-8000-000000000007'
const resultKey = `data-analyze/datasets/${datasetId}/${versionId}/result/data.ndjson`
const schemaKey = `data-analyze/datasets/${datasetId}/${versionId}/result/schema.json`

const validConfig = {
  title: '区域销售概览',
  description: '按区域展示销售额',
  filters: [{ id: 'region', type: 'select', title: '区域', dataset: 'result', field: 'region' }],
  widgets: [
    {
      id: 'sales',
      type: 'bar',
      title: '区域销售额',
      dataset: 'result',
      dimension: 'region',
      metric: 'totalAmount',
      layout: { x: 0, y: 0, w: 12, h: 4 },
    },
  ],
}

function mockReportConfig(config: unknown = validConfig) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(config) } }] }),
      { status: 200 },
    ),
  )
}

async function createDraft() {
  return authenticatedRequest(
    `/api/tasks/${taskId}/reports`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        promptVersionId: reportingPromptId,
        userRequirement: '使用柱状图展示区域销售额',
      }),
    },
    env,
  )
}

describe('报表草稿和发布 API', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM report_versions'),
      env.DB.prepare('DELETE FROM reports'),
      env.DB.prepare('DELETE FROM processing_tasks'),
      env.DB.prepare('DELETE FROM execution_plans'),
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
    ])
    const now = new Date().toISOString()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO analysis_templates
          (id, name, description, input_schema_json, processing_prompt_version_id,
           reporting_prompt_version_id, created_at, updated_at)
         VALUES (?, '销售模板', '报表测试', '[]', ?, ?, ?, ?)`,
      ).bind(templateId, processingPromptId, reportingPromptId, now, now),
      env.DB.prepare(
        `INSERT INTO prompt_versions (id, template_id, type, version, content, created_at)
         VALUES (?, ?, 'processing', 1, '加工约束', ?)`,
      ).bind(processingPromptId, templateId, now),
      env.DB.prepare(
        `INSERT INTO prompt_versions (id, template_id, type, version, content, created_at)
         VALUES (?, ?, 'reporting', 1, '固定组件生成报表', ?)`,
      ).bind(reportingPromptId, templateId, now),
      env.DB.prepare(
        "INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, 'sales.csv', ?)",
      ).bind(datasetId, templateId, now),
      env.DB.prepare(
        `INSERT INTO dataset_versions
          (id, dataset_id, source_object_key, file_type, validation_status, created_at)
         VALUES (?, ?, 'source.csv', 'csv', 'mapped', ?)`,
      ).bind(versionId, datasetId, now),
      env.DB.prepare(
        `INSERT INTO execution_plans
          (id, dataset_version_id, model_name, prompt_version_id, user_requirement,
           decision_json, confirmation_status, confirmed_at, created_at)
         VALUES (?, ?, 'model', ?, '加工', ?, 'confirmed', ?, ?)`,
      ).bind(
        planId,
        versionId,
        processingPromptId,
        JSON.stringify({ supported: false, scriptId: null, scriptVersion: null, parameters: null, reason: '测试', limitations: ['测试'] }),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO processing_tasks
          (id, plan_id, status, result_object_key, result_schema_object_key,
           result_summary_object_key, retry_count, created_at, updated_at)
         VALUES (?, ?, 'succeeded', ?, ?, 'summary.json', 1, ?, ?)`,
      ).bind(taskId, planId, resultKey, schemaKey, now, now),
    ])
    await env.DATA_BUCKET.put(
      resultKey,
      '{"region":"华东","totalAmount":150}\n{"region":"华南","totalAmount":80}\n',
    )
    await env.DATA_BUCKET.put(
      schemaKey,
      JSON.stringify([
        { name: 'region', type: 'string', description: '区域', required: true },
        { name: 'totalAmount', type: 'number', description: '销售额', required: true },
      ]),
    )
  })

  it('配置校验通过后仍需用户确认才发布，确认接口幂等', async () => {
    const fetchMock = mockReportConfig()
    const response = await createDraft()
    expect(response.status).toBe(201)
    const draft = (await response.json()) as { id: string }

    const detail = await authenticatedRequest(`/api/report-versions/${draft.id}`, {}, env)
    expect(await detail.json()).toMatchObject({
      validationStatus: 'valid',
      confirmedAt: null,
      published: false,
    })

    const first = await authenticatedRequest(`/api/report-versions/${draft.id}/confirm`, { method: 'POST' }, env)
    const second = await authenticatedRequest(`/api/report-versions/${draft.id}/confirm`, { method: 'POST' }, env)
    expect(await first.json()).toMatchObject({ published: true })
    expect(await second.json()).toMatchObject({ published: true })
    fetchMock.mockRestore()
  })

  it('只能通过 D1 中的精确 Key 读取私有报表数据', async () => {
    const fetchMock = mockReportConfig()
    const draft = (await (await createDraft()).json()) as { id: string }
    const response = await authenticatedRequest(`/api/report-versions/${draft.id}/data`, {}, env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { region: '华东', totalAmount: 150 },
      { region: '华南', totalAmount: 80 },
    ])
    fetchMock.mockRestore()
  })

  it('失败任务不能创建报表草稿', async () => {
    await env.DB.prepare("UPDATE processing_tasks SET status = 'failed' WHERE id = ?").bind(taskId).run()
    expect((await createDraft()).status).toBe(409)
  })

  it('未知字段配置被拒绝且不写入草稿', async () => {
    const invalidConfig = {
      ...validConfig,
      widgets: [{ ...validConfig.widgets[0], metric: 'missingMetric' }],
    }
    const fetchMock = mockReportConfig(invalidConfig)
    const response = await createDraft()
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'REPORT_VALIDATION_FAILED' })
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM report_versions').first(),
    ).toMatchObject({ count: 0 })
    fetchMock.mockRestore()
  })
})

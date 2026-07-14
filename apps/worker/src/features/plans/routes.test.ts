import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { app, type Env } from '../../index'

const templateId = '10000000-0000-4000-8000-000000000001'
const promptVersionId = '10000000-0000-4000-8000-000000000002'
const datasetId = '10000000-0000-4000-8000-000000000003'
const datasetVersionId = '10000000-0000-4000-8000-000000000004'

const supportedDecision = {
  supported: true,
  scriptId: 'sales-region-summary',
  scriptVersion: '1.0.0',
  parameters: { includeEmptyRegion: false },
  reason: '字段结构和需求均符合该脚本能力',
  limitations: [],
}

function createQueue(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as Queue
}

function requestEnv(queue: Queue): Env['Bindings'] {
  return {
    DB: env.DB,
    DATA_BUCKET: env.DATA_BUCKET,
    LLM_API_KEY: env.LLM_API_KEY,
    LLM_BASE_URL: env.LLM_BASE_URL,
    LLM_MODEL: env.LLM_MODEL,
    TASK_QUEUE: queue,
  }
}

async function insertPlan(decision: typeof supportedDecision | Record<string, unknown>) {
  const id = crypto.randomUUID()
  const supported = decision.supported === true
  await env.DB.prepare(
    `INSERT INTO execution_plans
      (id, dataset_version_id, model_name, prompt_version_id, user_requirement,
       decision_json, script_id, script_version, parameters_json,
       confirmation_status, created_at)
     VALUES (?, ?, 'unified-model', ?, '按区域汇总', ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(
      id,
      datasetVersionId,
      promptVersionId,
      JSON.stringify(decision),
      supported ? decision.scriptId : null,
      supported ? decision.scriptVersion : null,
      supported ? JSON.stringify(decision.parameters) : null,
      new Date().toISOString(),
    )
    .run()
  return id
}

describe('执行计划 API', () => {
  beforeEach(async () => {
    // 按外键逆序重建已映射数据集，确保确认逻辑读取真实 D1 与 R2 控制面数据。
    await env.DB.batch([
      env.DB.prepare('DELETE FROM processing_tasks'),
      env.DB.prepare('DELETE FROM execution_plans'),
      env.DB.prepare('DELETE FROM scripts'),
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
      env.DB.prepare(
        `INSERT INTO analysis_templates
          (id, name, description, input_schema_json, processing_prompt_version_id,
           created_at, updated_at)
         VALUES (?, '销售分析', '测试模板', ?, ?, ?, ?)`,
      ).bind(
        templateId,
        JSON.stringify([
          { name: 'region', type: 'string', description: '区域', required: true },
          { name: 'salesAmount', type: 'number', description: '销售额', required: true },
          { name: 'orderId', type: 'string', description: '订单号', required: true },
        ]),
        promptVersionId,
        new Date().toISOString(),
        new Date().toISOString(),
      ),
      env.DB.prepare(
        `INSERT INTO prompt_versions (id, template_id, type, version, content, created_at)
         VALUES (?, ?, 'processing', 1, '只选择完整脚本', ?)`,
      ).bind(promptVersionId, templateId, new Date().toISOString()),
      env.DB.prepare(
        "INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, 'sales.csv', ?)",
      ).bind(datasetId, templateId, new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO dataset_versions
          (id, dataset_id, source_object_key, schema_object_key, file_type,
           row_count, column_count, validation_status, created_at)
         VALUES (?, ?, 'source.csv', 'schema.json', 'csv', 2, 3, 'mapped', ?)`,
      ).bind(datasetVersionId, datasetId, new Date().toISOString()),
      ...[
        ['区域', 'region', 'string'],
        ['销售额', 'salesAmount', 'number'],
        ['订单号', 'orderId', 'string'],
      ].map(([source, target, type]) =>
        env.DB.prepare(
          `INSERT INTO field_mappings
            (id, template_id, source_field, target_field, target_type, required, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        ).bind(crypto.randomUUID(), templateId, source, target, type, new Date().toISOString()),
      ),
    ])
    await env.DATA_BUCKET.put(
      'schema.json',
      JSON.stringify({
        rowCount: 2,
        columnCount: 3,
        sheets: [],
        sourceFields: ['区域', '销售额', '订单号'],
      }),
    )
  })

  it('创建推荐时不投递任务且保存模型决策', async () => {
    const queueSend = vi.fn().mockResolvedValue(undefined)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(supportedDecision) } }] }),
        { status: 200 },
      ),
    )

    const response = await app.request(
      `/api/dataset-versions/${datasetVersionId}/plans`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promptVersionId, userRequirement: '按区域汇总销售额' }),
      },
      requestEnv(createQueue(queueSend)),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ decision: supportedDecision })
    expect(queueSend).not.toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  it('只有确认受支持计划时才投递 taskId', async () => {
    const planId = await insertPlan(supportedDecision)
    const queueSend = vi.fn().mockResolvedValue(undefined)
    const response = await app.request(
      `/api/plans/${planId}/confirm`,
      { method: 'POST' },
      requestEnv(createQueue(queueSend)),
    )

    expect(response.status).toBe(202)
    expect(queueSend).toHaveBeenCalledWith({ taskId: expect.any(String) })
  })

  it('拒绝确认不存在的脚本版本', async () => {
    const planId = await insertPlan({ ...supportedDecision, scriptVersion: '9.9.9' })
    const queueSend = vi.fn().mockResolvedValue(undefined)
    const response = await app.request(
      `/api/plans/${planId}/confirm`,
      { method: 'POST' },
      requestEnv(createQueue(queueSend)),
    )

    expect(response.status).toBe(409)
    expect(queueSend).not.toHaveBeenCalled()
  })

  it('拒绝不支持计划和重复确认', async () => {
    const unsupportedId = await insertPlan({
      supported: false,
      scriptId: null,
      scriptVersion: null,
      parameters: null,
      reason: '不支持',
      limitations: ['缺少脚本'],
    })
    const queueSend = vi.fn().mockResolvedValue(undefined)
    expect(
      (
        await app.request(
          `/api/plans/${unsupportedId}/confirm`,
          { method: 'POST' },
          requestEnv(createQueue(queueSend)),
        )
      ).status,
    ).toBe(409)

    const supportedId = await insertPlan(supportedDecision)
    const binding = requestEnv(createQueue(queueSend))
    expect((await app.request(`/api/plans/${supportedId}/confirm`, { method: 'POST' }, binding)).status).toBe(202)
    expect((await app.request(`/api/plans/${supportedId}/confirm`, { method: 'POST' }, binding)).status).toBe(409)
  })

  it('Queue 发送失败时将任务标记为 failed', async () => {
    const planId = await insertPlan(supportedDecision)
    const response = await app.request(
      `/api/plans/${planId}/confirm`,
      { method: 'POST' },
      requestEnv(createQueue(vi.fn().mockRejectedValue(new Error('queue down')))),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'QUEUE_PUBLISH_FAILED' })
    expect(
      await env.DB.prepare('SELECT status FROM processing_tasks WHERE plan_id = ?')
        .bind(planId)
        .first(),
    ).toMatchObject({ status: 'failed' })
  })
})

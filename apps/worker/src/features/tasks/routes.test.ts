import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../index'

describe('任务状态 API', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM processing_tasks'),
      env.DB.prepare('DELETE FROM execution_plans'),
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
    ])
  })

  it('返回失败终态和结构化错误，不暴露 R2 URL', async () => {
    const templateId = crypto.randomUUID()
    const promptId = crypto.randomUUID()
    const datasetId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    const planId = crypto.randomUUID()
    const taskId = crypto.randomUUID()
    const now = new Date().toISOString()
    const errorKey = `data-analyze/tasks/${taskId}/errors/execution.json`
    await env.DATA_BUCKET.put(
      errorKey,
      JSON.stringify({ code: 'FIELD_TYPE_MISMATCH', message: '字段类型错误', retryable: false }),
    )
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO analysis_templates
          (id, name, description, input_schema_json, processing_prompt_version_id,
           created_at, updated_at)
         VALUES (?, '模板', '测试', '[]', ?, ?, ?)`,
      ).bind(templateId, promptId, now, now),
      env.DB.prepare(
        `INSERT INTO prompt_versions (id, template_id, type, version, content, created_at)
         VALUES (?, ?, 'processing', 1, '约束', ?)`,
      ).bind(promptId, templateId, now),
      env.DB.prepare(
        "INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, 'a.csv', ?)",
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
         VALUES (?, ?, 'model', ?, '需求', ?, 'confirmed', ?, ?)`,
      ).bind(
        planId,
        versionId,
        promptId,
        JSON.stringify({
          supported: false,
          scriptId: null,
          scriptVersion: null,
          parameters: null,
          reason: '测试',
          limitations: ['测试'],
        }),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO processing_tasks
          (id, plan_id, status, error_object_key, retry_count, created_at, updated_at)
         VALUES (?, ?, 'failed', ?, 3, ?, ?)`,
      ).bind(taskId, planId, errorKey, now, now),
    ])

    const response = await app.request(`/api/tasks/${taskId}`, {}, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: taskId,
      status: 'failed',
      error: { code: 'FIELD_TYPE_MISMATCH', retryable: false },
    })
    expect(await (await app.request(`/api/tasks/${taskId}`, {}, env)).text()).not.toContain('r2://')
  })
})

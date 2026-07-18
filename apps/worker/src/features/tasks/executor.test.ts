import { env } from 'cloudflare:test'
import * as XLSX from 'xlsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { consumeTaskMessage } from './consumer'
import { executeTask } from './executor'
import { normalizeValue, TaskExecutionError } from './normalize'
import { createOutputWriter } from './output-writer'

const templateId = '20000000-0000-4000-8000-000000000001'
const promptVersionId = '20000000-0000-4000-8000-000000000002'
const datasetId = '20000000-0000-4000-8000-000000000003'
const versionId = '20000000-0000-4000-8000-000000000004'
const planId = '20000000-0000-4000-8000-000000000005'
const taskId = '20000000-0000-4000-8000-000000000006'
const sourceObjectKey = `data-analyze/datasets/${datasetId}/${versionId}/source/original.csv`

async function seedTask(
  source: string,
  status: 'queued' | 'succeeded' = 'queued',
  executionMode: 'baseline' | 'script' = 'script',
) {
  const now = new Date().toISOString()
  await env.DATA_BUCKET.put(sourceObjectKey, source)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO analysis_templates
        (id, name, description, input_schema_json, processing_prompt_version_id,
         created_at, updated_at)
       VALUES (?, '销售分析', '执行测试', ?, ?, ?, ?)`,
    ).bind(
      templateId,
      JSON.stringify([
        { name: 'region', type: 'string', sourceLabel: '区域', required: true },
        { name: 'salesAmount', type: 'number', sourceLabel: '销售额', required: true },
        { name: 'orderId', type: 'string', sourceLabel: '订单号', required: true },
      ]),
      promptVersionId,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO prompt_versions (id, template_id, type, version, content, created_at)
       VALUES (?, ?, 'processing', 1, '选择完整脚本', ?)`,
    ).bind(promptVersionId, templateId, now),
    env.DB.prepare(
      "INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, 'sales.csv', ?)",
    ).bind(datasetId, templateId, now),
    env.DB.prepare(
      `INSERT INTO dataset_versions
        (id, dataset_id, source_object_key, file_type, csv_encoding, csv_delimiter,
         row_count, column_count, validation_status, created_at)
       VALUES (?, ?, ?, 'csv', 'utf-8', ',', 2, 3, 'mapped', ?)`,
    ).bind(versionId, datasetId, sourceObjectKey, now),
    ...[
      ['区域', 'region', 'string'],
      ['销售额', 'salesAmount', 'number'],
      ['订单号', 'orderId', 'string'],
    ].map(([sourceField, targetField, targetType]) =>
      env.DB.prepare(
        `INSERT INTO field_mappings
          (id, dataset_version_id, source_field, target_field, target_type, required, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ).bind(crypto.randomUUID(), versionId, sourceField, targetField, targetType, now),
    ),
    env.DB.prepare(
      `INSERT INTO execution_plans
        (id, dataset_version_id, model_name, prompt_version_id, user_requirement,
         decision_json, script_id, script_version, parameters_json,
         confirmation_status, confirmed_at, created_at, execution_mode)
       VALUES (?, ?, 'unified-model', ?, '按区域汇总', ?, 'sales-region-summary',
               '1.0.0', ?, 'confirmed', ?, ?, ?)`,
    ).bind(
      planId,
      versionId,
      promptVersionId,
      JSON.stringify({
        supported: true,
        scriptId: 'sales-region-summary',
        scriptVersion: '1.0.0',
        parameters: { includeEmptyRegion: false },
        reason: '匹配',
        limitations: [],
      }),
      JSON.stringify({ includeEmptyRegion: false }),
      now,
      now,
      executionMode,
    ),
    env.DB.prepare(
      `INSERT INTO processing_tasks
        (id, plan_id, status, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).bind(taskId, planId, status, now, now),
  ])
}

describe('严格标准化', () => {
  it('number 字段出现非数字文本时永久失败', () => {
    expect(() => normalizeValue('一百元', 'number', 'salesAmount')).toThrowError(
      expect.objectContaining({ code: 'FIELD_TYPE_MISMATCH', retryable: false }),
    )
  })

  it('布尔和日期只接受明确格式', () => {
    expect(normalizeValue('false', 'boolean', 'enabled')).toBe(false)
    expect(() => normalizeValue('是', 'boolean', 'enabled')).toThrow()
    expect(normalizeValue('2026-07-14', 'date', 'date')).toBe('2026-07-14')
    expect(() => normalizeValue('2026/07/14', 'date', 'date')).toThrow()
  })
})

describe('任务执行器', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM data_assets'),
      env.DB.prepare('DELETE FROM processing_tasks'),
      env.DB.prepare('DELETE FROM execution_plans'),
      env.DB.prepare('DELETE FROM scripts'),
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
    ])
  })

  it('执行 CSV、写入结果并更新成功状态', async () => {
    await seedTask('区域,销售额,订单号\n华东,100,A\n华东,50,B\n')

    await expect(executeTask(taskId, env)).resolves.toMatchObject({ status: 'succeeded' })
    expect(
      await env.DB.prepare('SELECT status, result_object_key FROM processing_tasks WHERE id = ?')
        .bind(taskId)
        .first(),
    ).toMatchObject({ status: 'succeeded' })
    const result = await env.DATA_BUCKET.get(
      `data-analyze/datasets/${datasetId}/${versionId}/result/data.ndjson`,
    )
    expect(await result?.text()).toContain('"totalAmount":150')
  })

  it('执行用户已选择工作表的 XLSX', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['区域', '销售额', '订单号'],
        ['华南', 80, 'C'],
      ]),
      '销售数据',
    )
    const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await seedTask('placeholder')
    await env.DATA_BUCKET.put(sourceObjectKey, content)
    await env.DB.prepare(
      `UPDATE dataset_versions
       SET file_type = 'xlsx', csv_encoding = NULL, csv_delimiter = NULL,
           selected_sheet = '销售数据'
       WHERE id = ?`,
    )
      .bind(versionId)
      .run()

    await expect(executeTask(taskId, env)).resolves.toMatchObject({ status: 'succeeded' })
    const result = await env.DATA_BUCKET.get(
      `data-analyze/datasets/${datasetId}/${versionId}/result/data.ndjson`,
    )
    expect(await result?.text()).toContain('"region":"华南"')
  })

  it('baseline 任务直接产出英文键的标准化数据且不依赖脚本输出', async () => {
    await seedTask('区域,销售额,订单号\n华东,100,A\n', 'queued', 'baseline')

    await expect(executeTask(taskId, env)).resolves.toMatchObject({ status: 'succeeded' })
    const result = await env.DATA_BUCKET.get(
      `data-analyze/datasets/${datasetId}/${versionId}/normalized/data.ndjson`,
    )
    expect(JSON.parse((await result?.text()) ?? '')).toEqual({
      region: '华东',
      salesAmount: 100,
      orderId: 'A',
    })
    const summary = await env.DATA_BUCKET.get(
      `data-analyze/datasets/${datasetId}/${versionId}/result/summary.json`,
    )
    expect(await summary?.json()).toEqual({ rowCount: 1, mode: 'baseline' })
    expect(
      await env.DB.prepare(
        "SELECT kind, name, row_count, status FROM data_assets WHERE data_object_key = ?",
      )
        .bind(`data-analyze/datasets/${datasetId}/${versionId}/normalized/data.ndjson`)
        .first(),
    ).toMatchObject({ kind: 'source', name: 'sales', row_count: 1, status: 'ready' })
  })

  it('类型错误终止且标记为不可重试错误', async () => {
    await seedTask('区域,销售额,订单号\n华东,一百元,A\n')
    await expect(executeTask(taskId, env)).rejects.toMatchObject({
      code: 'FIELD_TYPE_MISMATCH',
      retryable: false,
    })
  })

  it('已成功任务不重复执行脚本或写入对象', async () => {
    await seedTask('区域,销售额,订单号\n华东,100,A\n', 'succeeded')
    const before = await env.DATA_BUCKET.list({ prefix: `data-analyze/tasks/${taskId}` })

    await expect(executeTask(taskId, env)).resolves.toEqual({ status: 'already_succeeded' })
    const after = await env.DATA_BUCKET.list({ prefix: `data-analyze/tasks/${taskId}` })
    expect(after.objects).toHaveLength(before.objects.length)
  })

  it('输出 Schema 错误会中止临时结果流', async () => {
    const output = createOutputWriter(
      env.DATA_BUCKET,
      `data-analyze/tasks/${taskId}/temporary/invalid.ndjson`,
      () => {
        throw new TaskExecutionError('SCRIPT_OUTPUT_INVALID', '输出错误', false)
      },
    )
    await expect(output.write({ bad: true })).rejects.toMatchObject({
      code: 'SCRIPT_OUTPUT_INVALID',
    })
    await output.abort()
  })

  it('暂时错误前三次重试，第三次后标记失败并确认消息', async () => {
    await seedTask('区域,销售额,订单号\n华东,100,A\n')
    const retry = vi.fn()
    const ack = vi.fn()
    const temporaryExecutor = vi
      .fn()
      .mockRejectedValue(new TaskExecutionError('R2_TEMPORARY_FAILURE', 'R2 暂时失败', true))

    await consumeTaskMessage(
      { body: { taskId }, attempts: 1, retry, ack } as unknown as Message<{ taskId: string }>,
      env,
      temporaryExecutor,
    )
    expect(retry).toHaveBeenCalledOnce()
    expect(ack).not.toHaveBeenCalled()

    retry.mockClear()
    await consumeTaskMessage(
      { body: { taskId }, attempts: 3, retry, ack } as unknown as Message<{ taskId: string }>,
      env,
      temporaryExecutor,
    )
    expect(retry).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledOnce()
    expect(
      await env.DB.prepare('SELECT status FROM processing_tasks WHERE id = ?').bind(taskId).first(),
    ).toMatchObject({ status: 'failed' })
  })
})

import { ScriptDecisionSchema } from '@data-analyze/contracts'
import { getScript } from '@data-analyze/scripts'
import type { StandardRecord } from '@data-analyze/script-sdk'

import type { Env } from '../../index'
import { createLogger } from '../../lib/logger'
import {
  normalizeRecord,
  readSourceRecords,
  TaskExecutionError,
  type RuntimeFieldMapping,
} from './normalize'
import {
  createOutputWriter,
  createR2NdjsonSink,
  type R2NdjsonSink,
  type StreamingOutputWriter,
} from './output-writer'

type TaskRow = {
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  confirmation_status: string
  execution_mode: 'baseline' | 'script'
  decision_json: string
  parameters_json: string | null
  dataset_id: string
  dataset_version_id: string
  source_object_key: string
  file_type: 'csv' | 'xlsx'
  csv_encoding: 'utf-8' | 'utf-8-bom' | 'gb18030' | null
  csv_delimiter: ',' | '\t' | ';' | null
  selected_sheet: string | null
}

export async function executeTask(taskId: string, env: Env['Bindings']) {
  const task = await env.DB.prepare(
    `SELECT pt.status, ep.confirmation_status, ep.execution_mode, ep.decision_json, ep.parameters_json,
            d.id AS dataset_id, dv.id AS dataset_version_id,
            dv.source_object_key, dv.file_type, dv.csv_encoding, dv.csv_delimiter,
            dv.selected_sheet
     FROM processing_tasks pt
     JOIN execution_plans ep ON ep.id = pt.plan_id
     JOIN dataset_versions dv ON dv.id = ep.dataset_version_id
     JOIN datasets d ON d.id = dv.dataset_id
     WHERE pt.id = ?`,
  )
    .bind(taskId)
    .first<TaskRow>()

  if (!task) throw new TaskExecutionError('TASK_NOT_FOUND', '处理任务不存在', false)
  if (task.status === 'succeeded') return { status: 'already_succeeded' as const }
  if (task.status === 'failed') return { status: 'already_failed' as const }
  if (task.confirmation_status !== 'confirmed') {
    throw new TaskExecutionError('PLAN_NOT_CONFIRMED', '执行计划尚未确认', false)
  }
  if (task.execution_mode === 'baseline') return executeBaselineTask(task, env, taskId)

  const decision = ScriptDecisionSchema.parse(JSON.parse(task.decision_json))
  if (!decision.supported || !task.parameters_json) {
    throw new TaskExecutionError('PLAN_NOT_SUPPORTED', '计划不包含可执行脚本', false)
  }

  let script
  let parameters: unknown
  try {
    script = getScript(decision.scriptId, decision.scriptVersion)
    parameters = script.parseParameters(JSON.parse(task.parameters_json))
  } catch {
    throw new TaskExecutionError('SCRIPT_VERSION_STALE', '脚本版本或参数已失效', false)
  }

  const mappingRows = await env.DB.prepare(
    `SELECT source_field, target_field, target_type
     FROM field_mappings WHERE dataset_version_id = ? ORDER BY source_field`,
  )
    .bind(task.dataset_version_id)
    .all<{ source_field: string; target_field: string; target_type: RuntimeFieldMapping['targetType'] }>()
  const mappings = mappingRows.results.map((row) => ({
    sourceField: row.source_field,
    targetField: row.target_field,
    targetType: row.target_type,
  }))
  if (mappings.length === 0) {
    throw new TaskExecutionError('FIELD_MAPPING_MISSING', '字段映射不存在', false)
  }

  const sourceObject = await env.DATA_BUCKET.get(task.source_object_key)
  if (!sourceObject) throw new TaskExecutionError('SOURCE_FILE_NOT_FOUND', '原始文件不存在', false)

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE processing_tasks
     SET status = 'running', retry_count = retry_count + 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ?`,
  )
    .bind(now, now, taskId)
    .run()

  const baseKey = `data-analyze/datasets/${task.dataset_id}/${task.dataset_version_id}`
  const normalizedKey = `${baseKey}/normalized/data.ndjson`
  const temporaryKey = `${baseKey}/temporary/${taskId}/processing.ndjson`
  const resultKey = `${baseKey}/result/data.ndjson`
  const resultSchemaKey = `${baseKey}/result/schema.json`
  const resultSummaryKey = `${baseKey}/result/summary.json`
  const normalizedSink: R2NdjsonSink = createR2NdjsonSink(env.DATA_BUCKET, normalizedKey)
  const logger = createLogger({
    taskId,
    datasetId: task.dataset_id,
    scriptId: decision.scriptId,
    scriptVersion: decision.scriptVersion,
  })
  let normalizedCompleted = false
  let outputWriter: StreamingOutputWriter | undefined

  try {
    const sourceContent = await sourceObject.arrayBuffer()
    const sourceOptions = resolveSourceOptions(task)
    const sourceRecords = readSourceRecords(sourceContent, sourceOptions)

    async function* normalizedInput(): AsyncGenerator<StandardRecord> {
      try {
        for await (const sourceRecord of sourceRecords) {
          const normalized = normalizeRecord(sourceRecord, mappings)
          await normalizedSink.write(normalized)
          yield normalized
        }
        normalizedCompleted = true
        await normalizedSink.close()
      } finally {
        if (!normalizedCompleted) await normalizedSink.abort()
      }
    }

    outputWriter = createOutputWriter(env.DATA_BUCKET, temporaryKey, script.parseOutput.bind(script))
    let processResult
    try {
      processResult = await script.process({
        taskId,
        scriptId: decision.scriptId,
        scriptVersion: decision.scriptVersion,
        parameters,
        input: normalizedInput(),
        output: outputWriter,
        // 脚本即使尝试记录参数或原始记录，也会被 Worker logger 的字段白名单剔除。
        logger: { info: (_message, fields) => logger.info('脚本运行信息', fields) },
      })
    } catch (error) {
      if (error instanceof TaskExecutionError) throw error
      throw new TaskExecutionError('SCRIPT_EXECUTION_FAILED', '脚本执行失败', false)
    }
    await outputWriter.close()
    if (processResult.rowCount !== outputWriter.rowCount) {
      throw new TaskExecutionError('SCRIPT_RESULT_COUNT_MISMATCH', '脚本结果行数不一致', false)
    }
    const temporaryObject = await env.DATA_BUCKET.get(temporaryKey)
    if (!temporaryObject?.body) {
      throw new TaskExecutionError('TEMPORARY_RESULT_MISSING', '临时结果不存在', true)
    }
    await env.DATA_BUCKET.put(resultKey, temporaryObject.body, {
      httpMetadata: { contentType: 'application/x-ndjson' },
    })
    await Promise.all([
      env.DATA_BUCKET.put(resultSchemaKey, JSON.stringify(script.metadata.outputFields), {
        httpMetadata: { contentType: 'application/json' },
      }),
      env.DATA_BUCKET.put(resultSummaryKey, JSON.stringify(processResult.summary), {
        httpMetadata: { contentType: 'application/json' },
      }),
    ])
    await env.DATA_BUCKET.delete(temporaryKey)

    const completedAt = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE processing_tasks
       SET status = 'succeeded', result_object_key = ?, result_schema_object_key = ?,
           result_summary_object_key = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(resultKey, resultSchemaKey, resultSummaryKey, completedAt, completedAt, taskId)
      .run()
    return { status: 'succeeded' as const, resultObjectKey: resultKey }
  } catch (error) {
    logger.error('脚本任务执行失败', {
      errorCode: error instanceof TaskExecutionError ? error.code : 'UNEXPECTED_TASK_ERROR',
    })
    await outputWriter?.abort()
    if (!normalizedCompleted) {
      await normalizedSink.abort()
    }
    throw error
  }
}

/**
 * 基础任务只执行经用户确认的映射和严格类型转换，不调用 LLM 或可变脚本。
 * 结果同时作为后续报表的首份可查询数据集。
 */
async function executeBaselineTask(task: TaskRow, env: Env['Bindings'], taskId: string) {
  const mappingRows = await env.DB.prepare(
    `SELECT source_field, target_field, target_type, required
     FROM field_mappings WHERE dataset_version_id = ? ORDER BY source_field`,
  )
    .bind(task.dataset_version_id)
    .all<{
      source_field: string
      target_field: string
      target_type: RuntimeFieldMapping['targetType']
      required: number
    }>()
  if (mappingRows.results.length === 0) {
    throw new TaskExecutionError('FIELD_MAPPING_MISSING', '字段映射不存在', false)
  }
  const sourceObject = await env.DATA_BUCKET.get(task.source_object_key)
  if (!sourceObject) throw new TaskExecutionError('SOURCE_FILE_NOT_FOUND', '原始文件不存在', false)

  const now = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE processing_tasks
     SET status = 'running', retry_count = retry_count + 1,
         started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ?`,
  )
    .bind(now, now, taskId)
    .run()

  const baseKey = `data-analyze/datasets/${task.dataset_id}/${task.dataset_version_id}`
  const resultKey = `${baseKey}/normalized/data.ndjson`
  const resultSchemaKey = `${baseKey}/result/schema.json`
  const resultSummaryKey = `${baseKey}/result/summary.json`
  const sink = createR2NdjsonSink(env.DATA_BUCKET, resultKey)
  const mappings = mappingRows.results.map((mapping) => ({
    sourceField: mapping.source_field,
    targetField: mapping.target_field,
    targetType: mapping.target_type,
  }))
  let rowCount = 0

  try {
    const sourceRecords = readSourceRecords(
      await sourceObject.arrayBuffer(),
      resolveSourceOptions(task),
    )
    for await (const sourceRecord of sourceRecords) {
      await sink.write(normalizeRecord(sourceRecord, mappings))
      rowCount += 1
    }
    await sink.close()
    await Promise.all([
      env.DATA_BUCKET.put(
        resultSchemaKey,
        JSON.stringify(
          mappingRows.results.map((mapping) => ({
            sourceLabel: mapping.source_field,
            name: mapping.target_field,
            type: mapping.target_type,
            required: mapping.required === 1,
          })),
        ),
        { httpMetadata: { contentType: 'application/json' } },
      ),
      env.DATA_BUCKET.put(
        resultSummaryKey,
        JSON.stringify({ rowCount, mode: 'baseline' }),
        { httpMetadata: { contentType: 'application/json' } },
      ),
    ])
    const completedAt = new Date().toISOString()
    await env.DB.prepare(
      `UPDATE processing_tasks
       SET status = 'succeeded', result_object_key = ?, result_schema_object_key = ?,
           result_summary_object_key = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(resultKey, resultSchemaKey, resultSummaryKey, completedAt, completedAt, taskId)
      .run()
    return { status: 'succeeded' as const, resultObjectKey: resultKey }
  } catch (error) {
    await sink.abort()
    throw error
  }
}

function resolveSourceOptions(task: TaskRow) {
  if (task.file_type === 'csv') {
    if (!task.csv_encoding || !task.csv_delimiter) {
      throw new TaskExecutionError('CSV_OPTIONS_MISSING', 'CSV 检查参数缺失', false)
    }
    return {
      fileType: 'csv' as const,
      encoding: task.csv_encoding,
      delimiter: task.csv_delimiter,
    }
  }
  if (!task.selected_sheet) {
    throw new TaskExecutionError('XLSX_SHEET_MISSING', 'Excel 工作表未选择', false)
  }
  return { fileType: 'xlsx' as const, selectedSheet: task.selected_sheet }
}

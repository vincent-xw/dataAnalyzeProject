import { FieldDefinitionSchema, ScriptDecisionSchema, type ScriptDecision } from '@data-analyze/contracts'
import { getScript, listScriptMetadata } from '@data-analyze/scripts'
import { z } from 'zod'

import type { Env } from '../../index'
import { requestScriptDecision } from '../llm/client'
import { buildProcessingContext } from '../llm/prompt'

export type TaskMessage = { taskId: string }

export class PlanServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 | 502 | 503 | 504,
  ) {
    super(message)
  }
}

type PlanSourceRow = {
  row_count: number | null
  column_count: number | null
  validation_status: string
  template_id: string
  input_schema_json: string
  prompt_content: string
  prompt_type: string
  prompt_template_id: string
}

type PlanRow = {
  id: string
  dataset_version_id: string
  model_name: string
  prompt_version_id: string
  user_requirement: string
  decision_json: string
  confirmation_status: 'pending' | 'confirmed'
  confirmed_at: string | null
  created_at: string
}

export class PlanService {
  constructor(private readonly env: Env['Bindings']) {}

  async create(datasetVersionId: string, promptVersionId: string, userRequirement: string) {
    const source = await this.env.DB.prepare(
      `SELECT dv.row_count, dv.column_count, dv.validation_status,
              d.template_id, at.input_schema_json,
              pv.content AS prompt_content, pv.type AS prompt_type,
              pv.template_id AS prompt_template_id
       FROM dataset_versions dv
       JOIN datasets d ON d.id = dv.dataset_id
       JOIN analysis_templates at ON at.id = d.template_id
       JOIN prompt_versions pv ON pv.id = ?
       WHERE dv.id = ?`,
    )
      .bind(promptVersionId, datasetVersionId)
      .first<PlanSourceRow>()

    if (!source) throw new PlanServiceError('DATASET_VERSION_NOT_FOUND', '数据集版本不存在', 404)
    if (source.validation_status !== 'mapped') {
      throw new PlanServiceError('DATASET_NOT_MAPPED', '数据集尚未完成字段映射', 409)
    }
    if (source.prompt_type !== 'processing' || source.prompt_template_id !== source.template_id) {
      throw new PlanServiceError('PROMPT_VERSION_MISMATCH', '加工 Prompt 版本不属于当前模板', 400)
    }
    if (source.row_count === null || source.column_count === null) {
      throw new PlanServiceError('DATASET_INSPECTION_MISSING', '数据集缺少结构检查计数', 409)
    }

    const fields = z.array(FieldDefinitionSchema).parse(JSON.parse(source.input_schema_json))
    const enabledRows = await this.env.DB.prepare(
      'SELECT id, version FROM scripts WHERE enabled = 1 ORDER BY id, version',
    ).all<{ id: string; version: string }>()
    const enabledVersions = new Set(enabledRows.results.map((row) => `${row.id}@${row.version}`))
    // D1 只负责开放开关，metadata 与可执行代码始终来自当前构建产物。
    const availableScripts = listScriptMetadata().filter((metadata) =>
      enabledVersions.has(`${metadata.id}@${metadata.version}`),
    )
    const context = buildProcessingContext({
      rowCount: source.row_count,
      columnCount: source.column_count,
      fields,
      scripts: availableScripts,
      templatePrompt: source.prompt_content,
      userRequirement,
    })
    const decision = await requestScriptDecision(context, this.env)
    this.validateDecision(decision, fields)

    const planId = crypto.randomUUID()
    const now = new Date().toISOString()
    await this.env.DB.prepare(
      `INSERT INTO execution_plans
        (id, dataset_version_id, model_name, prompt_version_id, user_requirement,
         decision_json, script_id, script_version, parameters_json,
         confirmation_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(
        planId,
        datasetVersionId,
        this.env.LLM_MODEL,
        promptVersionId,
        userRequirement,
        JSON.stringify(decision),
        decision.supported ? decision.scriptId : null,
        decision.supported ? decision.scriptVersion : null,
        decision.supported ? JSON.stringify(decision.parameters) : null,
        now,
      )
      .run()

    return { id: planId, decision, confirmationStatus: 'pending' as const, createdAt: now }
  }

  async get(id: string) {
    const plan = await this.env.DB.prepare('SELECT * FROM execution_plans WHERE id = ?')
      .bind(id)
      .first<PlanRow>()
    if (!plan) return null
    const task = await this.env.DB.prepare(
      `SELECT id, status, retry_count, result_object_key, result_schema_object_key,
              result_summary_object_key, error_object_key, created_at, updated_at
       FROM processing_tasks WHERE plan_id = ?`,
    )
      .bind(id)
      .first()
    const decision = ScriptDecisionSchema.parse(JSON.parse(plan.decision_json))
    let scriptMetadata = null
    if (decision.supported) {
      try {
        scriptMetadata = getScript(decision.scriptId, decision.scriptVersion).metadata
      } catch {
        // 已失效脚本仍保留原始决策供用户查看，但不能确认执行。
      }
    }
    return {
      id: plan.id,
      datasetVersionId: plan.dataset_version_id,
      modelName: plan.model_name,
      promptVersionId: plan.prompt_version_id,
      userRequirement: plan.user_requirement,
      decision,
      scriptMetadata,
      confirmationStatus: plan.confirmation_status,
      confirmedAt: plan.confirmed_at,
      createdAt: plan.created_at,
      task,
    }
  }

  async getAnalysisContext(datasetVersionId: string) {
    const row = await this.env.DB.prepare(
      `SELECT d.template_id, at.name AS template_name,
              at.processing_prompt_version_id, pv.content AS processing_prompt,
              dv.validation_status
       FROM dataset_versions dv
       JOIN datasets d ON d.id = dv.dataset_id
       JOIN analysis_templates at ON at.id = d.template_id
       LEFT JOIN prompt_versions pv ON pv.id = at.processing_prompt_version_id
       WHERE dv.id = ?`,
    )
      .bind(datasetVersionId)
      .first<{
        template_id: string
        template_name: string
        processing_prompt_version_id: string | null
        processing_prompt: string | null
        validation_status: string
      }>()
    if (!row) throw new PlanServiceError('DATASET_VERSION_NOT_FOUND', '数据集版本不存在', 404)
    if (row.validation_status !== 'mapped') {
      throw new PlanServiceError('DATASET_NOT_MAPPED', '数据集尚未完成字段映射', 409)
    }
    if (!row.processing_prompt_version_id || !row.processing_prompt) {
      throw new PlanServiceError('PROCESSING_PROMPT_MISSING', '模板缺少加工 Prompt', 409)
    }
    return {
      datasetVersionId,
      templateId: row.template_id,
      templateName: row.template_name,
      processingPromptVersionId: row.processing_prompt_version_id,
      processingPrompt: row.processing_prompt,
    }
  }

  async confirm(id: string, parameterOverride?: Record<string, unknown>) {
    const plan = await this.env.DB.prepare(
      `SELECT ep.*, d.template_id
       FROM execution_plans ep
       JOIN dataset_versions dv ON dv.id = ep.dataset_version_id
       JOIN datasets d ON d.id = dv.dataset_id
       WHERE ep.id = ?`,
    )
      .bind(id)
      .first<PlanRow & { template_id: string }>()
    if (!plan) throw new PlanServiceError('PLAN_NOT_FOUND', '执行计划不存在', 404)
    if (plan.confirmation_status !== 'pending') {
      throw new PlanServiceError('PLAN_ALREADY_CONFIRMED', '执行计划已经确认', 409)
    }

    const decision = ScriptDecisionSchema.parse(JSON.parse(plan.decision_json))
    if (!decision.supported) {
      throw new PlanServiceError('PLAN_NOT_SUPPORTED', '不支持的计划不能执行', 409)
    }

    const selectedParameters = parameterOverride ?? decision.parameters
    let script
    try {
      const catalogEntry = await this.env.DB.prepare(
        'SELECT enabled FROM scripts WHERE id = ? AND version = ?',
      ).bind(decision.scriptId, decision.scriptVersion).first<{ enabled: number }>()
      if (catalogEntry?.enabled !== 1) throw new Error('SCRIPT_NOT_ENABLED')
      script = getScript(decision.scriptId, decision.scriptVersion)
      script.parseParameters(selectedParameters)
    } catch {
      throw new PlanServiceError('SCRIPT_VERSION_STALE', '脚本版本或参数已失效', 409)
    }

    const mappings = await this.env.DB.prepare(
      'SELECT target_field, target_type FROM field_mappings WHERE template_id = ?',
    )
      .bind(plan.template_id)
      .all<{ target_field: string; target_type: string }>()
    const mappedTypes = new Map(
      mappings.results.map((mapping) => [mapping.target_field, mapping.target_type]),
    )
    const incompatible = script.metadata.inputFields.some(
      (field) => mappedTypes.get(field.name) !== field.type,
    )
    if (incompatible) {
      throw new PlanServiceError('SCRIPT_INPUT_MISMATCH', '当前字段映射不满足脚本输入', 409)
    }

    const taskId = crypto.randomUUID()
    const now = new Date().toISOString()
    const confirmedDecision = { ...decision, parameters: selectedParameters }
    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE execution_plans
         SET confirmation_status = 'confirmed', confirmed_at = ?,
             decision_json = ?, parameters_json = ?
         WHERE id = ? AND confirmation_status = 'pending'`,
      ).bind(now, JSON.stringify(confirmedDecision), JSON.stringify(selectedParameters), id),
      this.env.DB.prepare(
        `INSERT INTO processing_tasks
          (id, plan_id, status, retry_count, created_at, updated_at)
         VALUES (?, ?, 'queued', 0, ?, ?)`,
      ).bind(taskId, id, now, now),
    ])

    try {
      await this.env.TASK_QUEUE.send({ taskId })
    } catch {
      const errorObjectKey = `data-analyze/tasks/${taskId}/errors/queue.json`
      await this.env.DATA_BUCKET.put(
        errorObjectKey,
        JSON.stringify({ code: 'QUEUE_PUBLISH_FAILED', message: '任务投递失败' }),
        { httpMetadata: { contentType: 'application/json' } },
      )
      await this.env.DB.prepare(
        `UPDATE processing_tasks
         SET status = 'failed', error_object_key = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(errorObjectKey, now, now, taskId)
        .run()
      throw new PlanServiceError('QUEUE_PUBLISH_FAILED', '任务投递失败', 503)
    }

    return { taskId, status: 'queued' as const }
  }

  private validateDecision(decision: ScriptDecision, fields: z.infer<typeof FieldDefinitionSchema>[]) {
    if (!decision.supported) return
    try {
      const script = getScript(decision.scriptId, decision.scriptVersion)
      script.parseParameters(decision.parameters)
      const fieldTypes = new Map(fields.map((field) => [field.name, field.type]))
      if (script.metadata.inputFields.some((field) => fieldTypes.get(field.name) !== field.type)) {
        throw new Error('SCRIPT_INPUT_MISMATCH')
      }
    } catch {
      throw new PlanServiceError('LLM_INVALID_DECISION', '模型推荐了不可执行的脚本决策', 502)
    }
  }
}

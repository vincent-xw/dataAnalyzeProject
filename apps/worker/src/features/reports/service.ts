import { FieldDefinitionSchema } from '@data-analyze/contracts'
import { validateReportReferences } from '@data-analyze/report-schema'
import { z } from 'zod'

import type { Env } from '../../index'
import { ReportLlmError, requestReportConfig } from './llm'
import {
  materializeReportData,
  readNdjsonRecords,
  ReportMaterializationError,
} from './materialize'

export class ReportServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 | 422 | 502 | 503 | 504,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

type ReportTaskRow = {
  status: string
  result_object_key: string | null
  result_schema_object_key: string | null
  template_id: string
  prompt_content: string
  prompt_type: string
  prompt_template_id: string
}

type ReportVersionRow = {
  id: string
  report_id: string
  version: number
  user_requirement: string
  prompt_version_id: string
  config_object_key: string
  data_object_key: string
  validation_status: 'valid' | 'invalid'
  confirmed_at: string | null
  created_at: string
}

export class ReportService {
  constructor(private readonly env: Env['Bindings']) {}

  async getContext(taskId: string) {
    const row = await this.env.DB.prepare(
      `SELECT pt.status, ep.dataset_version_id, d.template_id, at.name AS template_name,
              at.reporting_prompt_version_id, pv.content AS reporting_prompt
       FROM processing_tasks pt
       JOIN execution_plans ep ON ep.id = pt.plan_id
       JOIN dataset_versions dv ON dv.id = ep.dataset_version_id
       JOIN datasets d ON d.id = dv.dataset_id
       JOIN analysis_templates at ON at.id = d.template_id
       LEFT JOIN prompt_versions pv ON pv.id = at.reporting_prompt_version_id
       WHERE pt.id = ?`,
    )
      .bind(taskId)
      .first<{
        status: string
        dataset_version_id: string
        template_id: string
        template_name: string
        reporting_prompt_version_id: string | null
        reporting_prompt: string | null
      }>()
    if (!row) throw new ReportServiceError('TASK_NOT_FOUND', '处理任务不存在', 404)
    if (row.status !== 'succeeded') {
      throw new ReportServiceError('TASK_NOT_SUCCEEDED', '只有成功任务可以创建报表', 409)
    }
    if (!row.reporting_prompt_version_id || !row.reporting_prompt) {
      throw new ReportServiceError('REPORTING_PROMPT_MISSING', '模板缺少报表 Prompt', 409)
    }
    const mappings = await this.env.DB.prepare(
      `SELECT source_field, target_field, target_type
       FROM field_mappings WHERE dataset_version_id = ? ORDER BY source_field`,
    )
      .bind(row.dataset_version_id)
      .all<{ source_field: string; target_field: string; target_type: string }>()
    return {
      taskId,
      templateId: row.template_id,
      templateName: row.template_name,
      reportingPromptVersionId: row.reporting_prompt_version_id,
      reportingPrompt: row.reporting_prompt,
      fields: mappings.results.map((mapping) => ({
        sourceLabel: mapping.source_field,
        name: mapping.target_field,
        type: mapping.target_type,
      })),
    }
  }

  async createDraft(taskId: string, promptVersionId: string, userRequirement: string) {
    const source = await this.env.DB.prepare(
      `SELECT pt.status, pt.result_object_key, pt.result_schema_object_key,
              d.template_id, pv.content AS prompt_content, pv.type AS prompt_type,
              pv.template_id AS prompt_template_id
       FROM processing_tasks pt
       JOIN execution_plans ep ON ep.id = pt.plan_id
       JOIN dataset_versions dv ON dv.id = ep.dataset_version_id
       JOIN datasets d ON d.id = dv.dataset_id
       JOIN prompt_versions pv ON pv.id = ?
       WHERE pt.id = ?`,
    )
      .bind(promptVersionId, taskId)
      .first<ReportTaskRow>()
    if (!source) throw new ReportServiceError('TASK_NOT_FOUND', '处理任务不存在', 404)
    if (source.status !== 'succeeded') {
      throw new ReportServiceError('TASK_NOT_SUCCEEDED', '只有成功任务可以创建报表', 409)
    }
    if (source.prompt_type !== 'reporting' || source.prompt_template_id !== source.template_id) {
      throw new ReportServiceError('PROMPT_VERSION_MISMATCH', '报表 Prompt 不属于当前模板', 400)
    }
    if (!source.result_object_key || !source.result_schema_object_key) {
      throw new ReportServiceError('TASK_RESULT_MISSING', '成功任务缺少结果对象', 409)
    }

    const [resultObject, schemaObject] = await Promise.all([
      this.env.DATA_BUCKET.get(source.result_object_key),
      this.env.DATA_BUCKET.get(source.result_schema_object_key),
    ])
    if (!resultObject || !schemaObject) {
      throw new ReportServiceError('TASK_RESULT_MISSING', '任务结果对象不存在', 404)
    }
    const fields = z.array(FieldDefinitionSchema).parse(await schemaObject.json())
    const config = await requestReportConfig(
      { fields, reportingPrompt: source.prompt_content, userRequirement },
      this.env,
    )

    const reportId = crypto.randomUUID()
    const reportVersionId = crypto.randomUUID()
    const version = 1
    let materialized
    try {
      materialized = await materializeReportData(
        readNdjsonRecords(resultObject),
        this.env.DATA_BUCKET,
        reportId,
        version,
      )
    } catch (error) {
      if (error instanceof ReportMaterializationError) {
        throw new ReportServiceError(error.code, error.message, 422)
      }
      throw error
    }

    const issues = validateReportReferences(config, fields, {
      rowCount: materialized.rowCount,
      byteSize: materialized.byteSize,
    })
    if (issues.length > 0) {
      await this.env.DATA_BUCKET.delete(materialized.dataKey)
      throw new ReportServiceError(
        'REPORT_VALIDATION_FAILED',
        '报表配置引用或规模无效',
        422,
        issues,
      )
    }

    const configObjectKey = `data-analyze/reports/${reportId}/${version}/report.json`
    await this.env.DATA_BUCKET.put(configObjectKey, JSON.stringify(config), {
      httpMetadata: { contentType: 'application/json' },
    })
    const now = new Date().toISOString()
    try {
      await this.env.DB.batch([
        this.env.DB.prepare('INSERT INTO reports (id, task_id, created_at) VALUES (?, ?, ?)').bind(
          reportId,
          taskId,
          now,
        ),
        this.env.DB.prepare(
          `INSERT INTO report_versions
            (id, report_id, version, user_requirement, prompt_version_id,
             config_object_key, data_object_key, validation_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
        ).bind(
          reportVersionId,
          reportId,
          version,
          userRequirement,
          promptVersionId,
          configObjectKey,
          materialized.dataKey,
          now,
        ),
      ])
    } catch (error) {
      await Promise.all([
        this.env.DATA_BUCKET.delete(configObjectKey),
        this.env.DATA_BUCKET.delete(materialized.dataKey),
      ])
      throw error
    }
    return {
      id: reportVersionId,
      reportId,
      version,
      config,
      validationStatus: 'valid' as const,
      confirmedAt: null,
      published: false,
      rowCount: materialized.rowCount,
    }
  }

  async get(id: string) {
    const row = await this.getRow(id)
    if (!row) return null
    const configObject = await this.env.DATA_BUCKET.get(row.config_object_key)
    if (!configObject) throw new ReportServiceError('REPORT_CONFIG_MISSING', '报表配置不存在', 404)
    return {
      id: row.id,
      reportId: row.report_id,
      version: row.version,
      userRequirement: row.user_requirement,
      promptVersionId: row.prompt_version_id,
      config: await configObject.json(),
      validationStatus: row.validation_status,
      confirmedAt: row.confirmed_at,
      published: row.confirmed_at !== null,
      createdAt: row.created_at,
    }
  }

  async confirm(id: string) {
    const row = await this.getRow(id)
    if (!row) throw new ReportServiceError('REPORT_VERSION_NOT_FOUND', '报表版本不存在', 404)
    if (row.validation_status !== 'valid') {
      throw new ReportServiceError('REPORT_VERSION_INVALID', '无效草稿不能发布', 409)
    }
    if (row.confirmed_at) return { id, confirmedAt: row.confirmed_at, published: true as const }
    const confirmedAt = new Date().toISOString()
    await this.env.DB.prepare('UPDATE report_versions SET confirmed_at = ? WHERE id = ?')
      .bind(confirmedAt, id)
      .run()
    return { id, confirmedAt, published: true as const }
  }

  async getDataObject(id: string) {
    const row = await this.getRow(id)
    if (!row) throw new ReportServiceError('REPORT_VERSION_NOT_FOUND', '报表版本不存在', 404)
    const object = await this.env.DATA_BUCKET.get(row.data_object_key)
    if (!object) throw new ReportServiceError('REPORT_DATA_MISSING', '报表数据不存在', 404)
    return object
  }

  private getRow(id: string) {
    return this.env.DB.prepare('SELECT * FROM report_versions WHERE id = ?')
      .bind(id)
      .first<ReportVersionRow>()
  }
}

export { ReportLlmError }

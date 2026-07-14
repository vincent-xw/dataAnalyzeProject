import type { FieldDefinition, PromptType } from '@data-analyze/contracts'

export interface CreateTemplateInput {
  name: string
  description: string
  fields: FieldDefinition[]
  processingPrompt: string
  reportingPrompt: string
}

export interface TemplateSummary {
  id: string
  name: string
  description: string
  fields: FieldDefinition[]
  processingPromptVersionId: string
  reportingPromptVersionId: string
  createdAt: string
  updatedAt: string
}

interface PromptRow {
  id: string
  type: PromptType
  version: number
  content: string
  created_at: string
}

interface TemplateRow {
  id: string
  name: string
  description: string
  input_schema_json: string
  processing_prompt_version_id: string | null
  reporting_prompt_version_id: string | null
  created_at: string
  updated_at: string
}

export class TemplateService {
  constructor(private readonly database: D1Database) {}

  async create(input: CreateTemplateInput) {
    const templateId = crypto.randomUUID()
    const processingPromptId = crypto.randomUUID()
    const reportingPromptId = crypto.randomUUID()
    const now = new Date().toISOString()

    // 四条语句通过 D1 batch 原子提交，避免模板只写入一半 Prompt。
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO analysis_templates
            (id, name, description, input_schema_json, processing_prompt_version_id,
             reporting_prompt_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(templateId, input.name, input.description, JSON.stringify(input.fields), now, now),
      this.database
        .prepare(
          `INSERT INTO prompt_versions
            (id, template_id, type, version, content, created_at)
           VALUES (?, ?, 'processing', 1, ?, ?)`,
        )
        .bind(processingPromptId, templateId, input.processingPrompt, now),
      this.database
        .prepare(
          `INSERT INTO prompt_versions
            (id, template_id, type, version, content, created_at)
           VALUES (?, ?, 'reporting', 1, ?, ?)`,
        )
        .bind(reportingPromptId, templateId, input.reportingPrompt, now),
      this.database
        .prepare(
          `UPDATE analysis_templates
           SET processing_prompt_version_id = ?, reporting_prompt_version_id = ?
           WHERE id = ?`,
        )
        .bind(processingPromptId, reportingPromptId, templateId),
    ])

    return {
      id: templateId,
      name: input.name,
      description: input.description,
      fields: input.fields,
      processingPromptVersionId: processingPromptId,
      reportingPromptVersionId: reportingPromptId,
      processingPromptVersion: 1,
      reportingPromptVersion: 1,
      createdAt: now,
      updatedAt: now,
    }
  }

  async list(): Promise<TemplateSummary[]> {
    const result = await this.database
      .prepare('SELECT * FROM analysis_templates ORDER BY created_at DESC')
      .all<TemplateRow>()

    return result.results.map((row) => this.mapTemplateRow(row))
  }

  async get(id: string) {
    const row = await this.database
      .prepare('SELECT * FROM analysis_templates WHERE id = ?')
      .bind(id)
      .first<TemplateRow>()

    if (!row) return null
    if (!row.processing_prompt_version_id || !row.reporting_prompt_version_id) {
      throw new Error('TEMPLATE_PROMPT_VERSION_MISSING')
    }

    const [processingPrompt, reportingPrompt] = await Promise.all([
      this.getPrompt(row.processing_prompt_version_id),
      this.getPrompt(row.reporting_prompt_version_id),
    ])

    return {
      ...this.mapTemplateRow(row),
      processingPrompt,
      reportingPrompt,
    }
  }

  async createPromptVersion(templateId: string, type: PromptType, content: string) {
    const template = await this.database
      .prepare('SELECT id FROM analysis_templates WHERE id = ?')
      .bind(templateId)
      .first<{ id: string }>()

    if (!template) return null

    const versionRow = await this.database
      .prepare(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM prompt_versions WHERE template_id = ? AND type = ?`,
      )
      .bind(templateId, type)
      .first<{ version: number }>()

    if (!versionRow) throw new Error('PROMPT_VERSION_QUERY_FAILED')

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const currentColumn =
      type === 'processing' ? 'processing_prompt_version_id' : 'reporting_prompt_version_id'

    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO prompt_versions
            (id, template_id, type, version, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, templateId, type, versionRow.version, content, now),
      this.database
        .prepare(`UPDATE analysis_templates SET ${currentColumn} = ?, updated_at = ? WHERE id = ?`)
        .bind(id, now, templateId),
    ])

    return { id, templateId, type, version: versionRow.version, content, createdAt: now }
  }

  private async getPrompt(id: string) {
    const row = await this.database
      .prepare('SELECT id, type, version, content, created_at FROM prompt_versions WHERE id = ?')
      .bind(id)
      .first<PromptRow>()

    if (!row) throw new Error('PROMPT_VERSION_NOT_FOUND')
    return {
      id: row.id,
      type: row.type,
      version: row.version,
      content: row.content,
      createdAt: row.created_at,
    }
  }

  private mapTemplateRow(row: TemplateRow): TemplateSummary {
    if (!row.processing_prompt_version_id || !row.reporting_prompt_version_id) {
      throw new Error('TEMPLATE_PROMPT_VERSION_MISSING')
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fields: JSON.parse(row.input_schema_json) as FieldDefinition[],
      processingPromptVersionId: row.processing_prompt_version_id,
      reportingPromptVersionId: row.reporting_prompt_version_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

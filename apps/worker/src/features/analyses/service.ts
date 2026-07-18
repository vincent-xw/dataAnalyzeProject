import { ReportConfigSchema, type ReportConfig } from '@data-analyze/report-schema'

import type { Env } from '../../index'

export type FailureGuidance = { summary: string; suggestion: string; revisedRequirement: string }
type AnalysisRow = { id: string; requirement: string; title: string | null; config_json: string | null; status: 'ready' | 'failed'; failure_reason: string | null; failure_guidance_json: string | null; prompt_version_id: string | null; created_by: string; created_at: string }

export class AnalysisService {
  constructor(private readonly env: Env['Bindings']) {}

  async assetContext(assetId: string) {
    const asset = await this.env.DB.prepare('SELECT id, name, data_object_key, schema_object_key, row_count FROM data_assets WHERE id = ?').bind(assetId).first<{ id: string; name: string; data_object_key: string; schema_object_key: string; row_count: number }>()
    if (!asset) return null
    const [schemaObject, dataObject] = await Promise.all([this.env.DATA_BUCKET.get(asset.schema_object_key), this.env.DATA_BUCKET.head(asset.data_object_key)])
    if (!schemaObject || !dataObject) return null
    const fields = await schemaObject.json<Array<{ name: string; type: string }>>()
    return { asset, fields, byteSize: dataObject.size }
  }

  async create(assetIds: string[], primaryAssetId: string, requirement: string, createdBy: string, config: ReportConfig | null, failureReason: string | null, promptVersionId: string | null = null, guidance: FailureGuidance | null = null) {
    const id = crypto.randomUUID(); const createdAt = new Date().toISOString()
    await this.env.DB.prepare(`INSERT INTO analyses (id, requirement, title, config_json, status, failure_reason, failure_guidance_json, prompt_version_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, requirement, config?.title ?? null, config ? JSON.stringify(config) : null, config ? 'ready' : 'failed', failureReason, guidance ? JSON.stringify(guidance) : null, promptVersionId, createdBy, createdAt).run()
    await this.env.DB.batch(assetIds.map((assetId) => this.env.DB.prepare('INSERT INTO analysis_data_assets (analysis_id, asset_id, role) VALUES (?, ?, ?)').bind(id, assetId, assetId === primaryAssetId ? 'primary' : 'reference')))
    return this.get(id)
  }

  async list() {
    const rows = await this.env.DB.prepare(`SELECT a.* FROM analyses a ORDER BY a.created_at DESC`).all<AnalysisRow>()
    return Promise.all(rows.results.map((row) => this.detail(row)))
  }

  async get(id: string) {
    const row = await this.env.DB.prepare('SELECT * FROM analyses WHERE id = ?').bind(id).first<AnalysisRow>()
    return row ? this.detail(row) : null
  }

  async detailWithRows(id: string) {
    const analysis = await this.get(id); if (!analysis) return null
    if (analysis.status === 'failed') return { ...analysis, rows: [] }
    const primary = await this.primaryAsset(id); if (!primary) return null
    const context = await this.assetContext(primary.id); if (!context) return null
    const object = await this.env.DATA_BUCKET.get(context.asset.data_object_key); if (!object) return null
    return { ...analysis, rows: (await object.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>) }
  }

  private async primaryAsset(analysisId: string) { return this.env.DB.prepare(`SELECT d.id, d.name FROM data_assets d JOIN analysis_data_assets ada ON ada.asset_id = d.id WHERE ada.analysis_id = ? AND ada.role = 'primary'`).bind(analysisId).first<{ id: string; name: string }>() }
  private async assets(analysisId: string) { const rows = await this.env.DB.prepare(`SELECT d.id, d.name, ada.role FROM data_assets d JOIN analysis_data_assets ada ON ada.asset_id = d.id WHERE ada.analysis_id = ? ORDER BY ada.role DESC, d.name`).bind(analysisId).all<{ id: string; name: string; role: 'primary' | 'reference' }>(); return rows.results }
  private summary(row: AnalysisRow) { return { id: row.id, requirement: row.requirement, title: row.title, status: row.status, failureReason: row.failure_reason, guidance: row.failure_guidance_json ? JSON.parse(row.failure_guidance_json) as FailureGuidance : null, promptVersionId: row.prompt_version_id, createdAt: row.created_at } }
  private async detail(row: AnalysisRow) { return { ...this.summary(row), assets: await this.assets(row.id), config: row.config_json ? ReportConfigSchema.parse(JSON.parse(row.config_json)) : null } }
}

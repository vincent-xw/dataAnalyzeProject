import { ReportConfigSchema, type ReportConfig } from '@data-analyze/report-schema'

import type { Env } from '../../index'

type AnalysisRow = { id: string; asset_id: string; requirement: string; title: string | null; config_json: string | null; status: 'ready' | 'failed'; failure_reason: string | null; created_by: string; created_at: string }

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

  async create(assetId: string, requirement: string, createdBy: string, config: ReportConfig | null, failureReason: string | null) {
    const id = crypto.randomUUID(); const createdAt = new Date().toISOString()
    await this.env.DB.prepare(`INSERT INTO analyses (id, asset_id, requirement, title, config_json, status, failure_reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, assetId, requirement, config?.title ?? null, config ? JSON.stringify(config) : null, config ? 'ready' : 'failed', failureReason, createdBy, createdAt).run()
    return this.get(assetId, id)
  }

  async list(assetId: string) {
    const rows = await this.env.DB.prepare('SELECT * FROM analyses WHERE asset_id = ? ORDER BY created_at DESC').bind(assetId).all<AnalysisRow>()
    return rows.results.map((row) => this.summary(row))
  }

  async get(assetId: string, id: string) {
    const row = await this.env.DB.prepare('SELECT * FROM analyses WHERE id = ? AND asset_id = ?').bind(id, assetId).first<AnalysisRow>()
    return row ? this.detail(row) : null
  }

  async detailWithRows(assetId: string, id: string) {
    const analysis = await this.get(assetId, id); if (!analysis) return null
    if (analysis.status === 'failed') return { ...analysis, rows: [] }
    const context = await this.assetContext(assetId); if (!context) return null
    const object = await this.env.DATA_BUCKET.get(context.asset.data_object_key); if (!object) return null
    return { ...analysis, rows: (await object.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>) }
  }

  private summary(row: AnalysisRow) { return { id: row.id, assetId: row.asset_id, requirement: row.requirement, title: row.title, status: row.status, failureReason: row.failure_reason, createdAt: row.created_at } }
  private detail(row: AnalysisRow) { return { ...this.summary(row), config: row.config_json ? ReportConfigSchema.parse(JSON.parse(row.config_json)) : null } }
}

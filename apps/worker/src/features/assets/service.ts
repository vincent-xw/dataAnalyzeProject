import type { Env } from '../../index'

type AssetRow = {
  id: string
  kind: 'source' | 'derived'
  name: string
  description: string | null
  tags_json: string
  data_object_key: string
  schema_object_key: string
  row_count: number
  status: 'ready' | 'processing' | 'failed'
  created_by: string
  created_at: string
  updated_at: string
}

/** 数据资产查询只返回控制面信息；真实数据通过受限预览接口读取。 */
export class AssetService {
  constructor(private readonly env: Env['Bindings']) {}

  async list() {
    const rows = await this.env.DB.prepare(
      `SELECT * FROM data_assets
       ORDER BY created_at DESC`,
    ).all<AssetRow>()
    return rows.results.map((row) => this.toAsset(row))
  }

  async get(id: string) {
    const row = await this.env.DB.prepare(
      `SELECT * FROM data_assets WHERE id = ?`,
    ).bind(id).first<AssetRow>()
    return row ? this.toAsset(row) : null
  }

  async preview(id: string) {
    const asset = await this.get(id)
    if (!asset) return null
    const object = await this.env.DATA_BUCKET.get(asset.dataObjectKey)
    if (!object) throw new AssetServiceError('ASSET_DATA_MISSING', '数据资产内容不存在', 404)
    const lines = (await object.text()).split('\n').filter(Boolean).slice(0, 50)
    const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    return { rowCount: asset.rowCount, rows }
  }

  /** 元数据只服务于人工识别、筛选和后续选择，不参与 NDJSON 的任何运算。 */
  async updateMetadata(
    id: string,
    metadata: { name: string; description: string | null; tags: string[] },
  ) {
    const asset = await this.get(id)
    if (!asset) return null
    const updatedAt = new Date().toISOString()
    await this.env.DB.prepare(
      `UPDATE data_assets
       SET name = ?, description = ?, tags_json = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(metadata.name, metadata.description, JSON.stringify(metadata.tags), updatedAt, id).run()
    return this.get(id)
  }

  private toAsset(row: AssetRow) {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      tags: JSON.parse(row.tags_json) as string[],
      dataObjectKey: row.data_object_key,
      schemaObjectKey: row.schema_object_key,
      rowCount: row.row_count,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

export class AssetServiceError extends Error {
  constructor(readonly code: string, message: string, readonly status: 404) {
    super(message)
  }
}

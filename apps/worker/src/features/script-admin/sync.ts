import { listScriptMetadata, validateScriptRegistry } from '@data-analyze/scripts'

export type ScriptCatalogSyncResult = { synced: number }

/** 原子同步完整脚本目录：先禁用旧索引，再启用当前构建产物中的精确版本。 */
export async function syncScriptCatalog(
  database: D1Database,
  registry: readonly unknown[] = listScriptMetadata(),
): Promise<ScriptCatalogSyncResult> {
  // 校验必须发生在 prepare/batch 前，失败时 D1 保持完全不变。
  const metadataList = validateScriptRegistry(registry)
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = [
    database.prepare('UPDATE scripts SET enabled = 0 WHERE enabled = 1'),
  ]

  for (const metadata of metadataList) {
    statements.push(
      database
        .prepare(
          `INSERT INTO scripts (id, version, metadata_json, enabled, created_at)
           VALUES (?, ?, ?, 1, ?)
           ON CONFLICT (id, version) DO UPDATE SET
             metadata_json = excluded.metadata_json,
             enabled = 1`,
        )
        .bind(metadata.id, metadata.version, JSON.stringify(metadata), now),
    )
  }

  await database.batch(statements)
  return { synced: metadataList.length }
}

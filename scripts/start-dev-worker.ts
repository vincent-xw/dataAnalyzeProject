import { spawn, spawnSync } from 'node:child_process'

import { listScriptMetadata } from '../packages/scripts/src/registry'

const workerFilter = ['--filter', '@data-analyze/worker', 'exec', 'wrangler']
const persistArguments = ['--persist-to', '.wrangler/dev-state']

/** 本地开发每次启动均应用 Migration，确保 D1 Schema 与当前代码一致。 */
const migration = spawnSync(
  'pnpm',
  [...workerFilter, 'd1', 'migrations', 'apply', 'data-analyze-db', '--local', ...persistArguments],
  { stdio: 'inherit' },
)
if (migration.status !== 0) process.exit(migration.status ?? 1)

/** 初始化构建期脚本目录，使本地开发能完整执行分析流程而不依赖线上同步接口。 */
const now = new Date().toISOString()
const catalogSql = [
  'UPDATE scripts SET enabled = 0 WHERE enabled = 1',
  ...listScriptMetadata().map((metadata) => {
    const serialized = JSON.stringify(metadata).replace(/'/g, "''")
    return `INSERT INTO scripts (id, version, metadata_json, enabled, created_at) VALUES ('${metadata.id}', '${metadata.version}', '${serialized}', 1, '${now}') ON CONFLICT (id, version) DO UPDATE SET metadata_json = excluded.metadata_json, enabled = 1`
  }),
].join('; ')
const catalog = spawnSync(
  'pnpm',
  [...workerFilter, 'd1', 'execute', 'data-analyze-db', '--local', ...persistArguments, '--command', catalogSql],
  { stdio: 'inherit' },
)
if (catalog.status !== 0) process.exit(catalog.status ?? 1)

const worker = spawn(
  'pnpm',
  [
    ...workerFilter,
    'dev',
    '--local',
    '--port',
    '8787',
    ...persistArguments,
    '--var',
    'ENVIRONMENT:development',
  ],
  { stdio: 'inherit' },
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => worker.kill(signal))
}
worker.on('exit', (code) => process.exit(code ?? 0))

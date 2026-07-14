import { spawn, spawnSync } from 'node:child_process'

import {
  TEST_ACCESS_AUDIENCE,
  TEST_ACCESS_DOMAIN,
  TEST_ACCESS_PUBLIC_JWK,
} from '../tests/e2e/test-access-token'

const workerFilter = ['--filter', '@data-analyze/worker', 'exec', 'wrangler']
const persistArguments = ['--persist-to', '.wrangler/e2e-state']

/** 先对同一套本地持久化状态应用迁移，失败时禁止启动 Worker。 */
const migration = spawnSync(
  'pnpm',
  [...workerFilter, 'd1', 'migrations', 'apply', 'data-analyze-db', '--local', ...persistArguments],
  { stdio: 'inherit' },
)
if (migration.status !== 0) process.exit(migration.status ?? 1)

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
    'ENVIRONMENT:test',
    '--var',
    `CF_ACCESS_TEAM_DOMAIN:${TEST_ACCESS_DOMAIN}`,
    '--var',
    `CF_ACCESS_AUD:${TEST_ACCESS_AUDIENCE}`,
    '--var',
    `ACCESS_TEST_PUBLIC_JWK:${JSON.stringify(TEST_ACCESS_PUBLIC_JWK)}`,
  ],
  { stdio: 'inherit' },
)

// Playwright 结束 webServer 时同步终止子进程，避免遗留本地端口。
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => worker.kill(signal))
}
worker.on('exit', (code) => process.exit(code ?? 0))

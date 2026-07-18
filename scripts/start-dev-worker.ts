import { spawn } from 'node:child_process'

const workerFilter = ['--filter', '@data-analyze/worker', 'exec', 'wrangler']

const worker = spawn(
  'pnpm',
  [...workerFilter, 'dev', '--port', '8787', '--var', 'ENVIRONMENT:development'],
  { stdio: 'inherit' },
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => worker.kill(signal))
}
worker.on('exit', (code) => process.exit(code ?? 0))

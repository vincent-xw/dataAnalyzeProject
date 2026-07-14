import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 40_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx scripts/start-e2e-worker.ts',
      url: 'http://127.0.0.1:8787/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @data-analyze/web dev --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})

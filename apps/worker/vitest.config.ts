import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations('./migrations')

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        bindings: {
          LLM_API_KEY: 'test-key',
          LLM_BASE_URL: 'https://llm.example.com/v1',
          LLM_MODEL: 'unified-model',
          CF_ACCESS_AUD: 'test-access-audience',
          CF_ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
          GITHUB_TOKEN: 'test-github-token',
          GITHUB_OWNER: 'test-owner',
          GITHUB_REPO: 'test-repo',
          GITHUB_BASE_BRANCH: 'main',
          ENVIRONMENT: 'unit-test',
          ACCESS_TEST_PUBLIC_JWK: '{}',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./src/testing/setup.ts'],
  },
})

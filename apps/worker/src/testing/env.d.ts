import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      DATA_BUCKET: R2Bucket
      LLM_API_KEY: string
      LLM_BASE_URL: string
      LLM_MODEL: string
      TASK_QUEUE: Queue
      CF_ACCESS_AUD: string
      CF_ACCESS_TEAM_DOMAIN: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}

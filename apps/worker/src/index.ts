import { Hono } from 'hono'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
  }
}

export const app = new Hono<Env>()

app.get('/health', (context) => context.json({ status: 'ok' as const }))

export default app

import { Hono } from 'hono'

import { templateRoutes } from './features/templates/routes'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
  }
}

export const app = new Hono<Env>()

app.get('/health', (context) => context.json({ status: 'ok' as const }))
app.route('/api/templates', templateRoutes)

export default app

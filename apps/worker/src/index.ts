import { Hono } from 'hono'

import { templateRoutes } from './features/templates/routes'
import { datasetRoutes } from './features/datasets/routes'
import { datasetVersionPlanRoutes, planRoutes } from './features/plans/routes'
import type { TaskMessage } from './features/plans/service'
import { consumeTaskBatch } from './features/tasks/consumer'
import { taskRoutes } from './features/tasks/routes'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
    LLM_API_KEY: string
    LLM_BASE_URL: string
    LLM_MODEL: string
    TASK_QUEUE: Queue<TaskMessage>
  }
}

export const app = new Hono<Env>()

app.get('/health', (context) => context.json({ status: 'ok' as const }))
app.route('/api/templates', templateRoutes)
app.route('/api/datasets', datasetRoutes)
app.route('/api/dataset-versions', datasetVersionPlanRoutes)
app.route('/api/plans', planRoutes)
app.route('/api/tasks', taskRoutes)

export default {
  fetch: app.fetch,
  queue: consumeTaskBatch,
} satisfies ExportedHandler<Env['Bindings'], TaskMessage>

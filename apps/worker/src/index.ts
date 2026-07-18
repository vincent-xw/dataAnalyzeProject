import { Hono } from 'hono'

import { templateRoutes } from './features/templates/routes'
import { datasetRoutes } from './features/datasets/routes'
import { datasetVersionPlanRoutes, planRoutes } from './features/plans/routes'
import type { TaskMessage } from './features/plans/service'
import { consumeTaskBatch } from './features/tasks/consumer'
import { taskRoutes } from './features/tasks/routes'
import { reportVersionRoutes, taskReportRoutes } from './features/reports/routes'
import { scriptAdminRoutes } from './features/script-admin/routes'
import { assetRoutes } from './features/assets/routes'
import { requireAccess, type AuthenticatedUser } from './middleware/access-auth'
import { handleError, requestContext } from './middleware/error-handler'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
    LLM_API_KEY: string
    LLM_BASE_URL: string
    LLM_MODEL: string
    TASK_QUEUE: Queue<TaskMessage>
    CF_ACCESS_AUD: string
    CF_ACCESS_TEAM_DOMAIN: string
    GITHUB_TOKEN: string
    GITHUB_OWNER: string
    GITHUB_REPO: string
    GITHUB_BASE_BRANCH: string
    ENVIRONMENT: string
    ACCESS_TEST_PUBLIC_JWK?: string
  }
  Variables: {
    authenticatedUser: AuthenticatedUser
    requestId: string
  }
}

export const app = new Hono<Env>()

app.use('*', requestContext())
app.onError(handleError)
app.get('/health', (context) => context.json({ status: 'ok' as const }))
app.use('/api/*', requireAccess())
app.use('/internal/*', requireAccess())
app.route('/api/templates', templateRoutes)
app.route('/api/datasets', datasetRoutes)
app.route('/api/dataset-versions', datasetVersionPlanRoutes)
app.route('/api/plans', planRoutes)
app.route('/api/tasks', taskRoutes)
app.route('/api/tasks', taskReportRoutes)
app.route('/api/report-versions', reportVersionRoutes)
app.route('/api/assets', assetRoutes)
app.route('/internal/scripts', scriptAdminRoutes)

export default {
  fetch: app.fetch,
  queue: consumeTaskBatch,
} satisfies ExportedHandler<Env['Bindings'], TaskMessage>

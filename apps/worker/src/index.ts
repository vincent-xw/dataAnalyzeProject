import { Hono } from 'hono'

import { assetRoutes } from './features/assets/routes'
import { analysisRoutes } from './features/analyses/routes'
import { requireAccess, type AuthenticatedUser } from './middleware/access-auth'
import { handleError, requestContext } from './middleware/error-handler'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
    LLM_API_KEY: string
    LLM_BASE_URL: string
    LLM_MODEL: string
    CF_ACCESS_AUD: string
    CF_ACCESS_TEAM_DOMAIN: string
    GITHUB_TOKEN: string
    GITHUB_OWNER: string
    GITHUB_REPO: string
    GITHUB_BASE_BRANCH: string
    ENVIRONMENT: string
    LOG_SENSITIVE_DEBUG?: string
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
app.route('/api/assets', assetRoutes)
app.route('/api/analyses', analysisRoutes)

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env['Bindings']>

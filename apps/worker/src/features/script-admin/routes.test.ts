import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import { app, type Env } from '../../index'
import { authenticatedRequest } from '../../testing/request'
import { createScriptAdminRoutes } from './routes'

const source = "export const metadata = { id: 'regional-sales', version: '1.1.0' }; export const script = { metadata }"

describe('候选脚本管理 API', () => {
  it('全局 Access 中间件拒绝未认证请求', async () => {
    const response = await app.request('/internal/scripts/candidates', { method: 'POST' }, env)
    expect(response.status).toBe(401)
  })

  it('返回候选分支与 PR 地址', async () => {
    const createPullRequest = vi.fn().mockResolvedValue({
      branch: 'script-candidate/regional-sales-1.1.0',
      path: 'packages/scripts/src/regional-sales/1.1.0.ts',
      pullRequestUrl: 'https://github.com/owner/repo/pull/12',
    })
    const routes = createScriptAdminRoutes(createPullRequest)
    const bindings = env as Env['Bindings']
    const response = await routes.request('/candidates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'regional-sales', version: '1.1.0', source }),
    }, bindings)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      branch: 'script-candidate/regional-sales-1.1.0',
      pullRequestUrl: 'https://github.com/owner/repo/pull/12',
      status: 'awaiting_ci',
    })
  })

  it('拒绝覆盖构建注册表中的精确版本', async () => {
    const response = await authenticatedRequest('/internal/scripts/candidates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'sales-region-summary',
          version: '1.0.0',
          source: "export const metadata = { id: 'sales-region-summary', version: '1.0.0' }; export const script = { metadata }",
        }),
      }, env)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'SCRIPT_VERSION_EXISTS' })
  })
})

import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { app, type Env } from '../../index'
import { authenticatedRequest } from '../../testing/request'
import { createScriptAdminRoutes } from './routes'

const source = "export const metadata = { id: 'regional-sales', version: '1.1.0' }; export const script = { metadata }"

describe('候选脚本管理 API', () => {
  it('全局 Access 中间件拒绝未认证请求', async () => {
    const response = await app.request('/internal/scripts/candidates', { method: 'POST' }, env)
    expect(response.status).toBe(401)
  })

  it('将候选源码直接保存到 R2，不创建分支或 Pull Request', async () => {
    const routes = createScriptAdminRoutes()
    const bindings = env as Env['Bindings']
    const response = await routes.request('/candidates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'regional-sales', version: '1.1.0', source }),
    }, bindings)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(expect.objectContaining({ status: 'stored', objectKey: expect.stringContaining('data-analyze/script-drafts/') }))
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

import { env } from 'cloudflare:test'

import { app, type Env } from '../index'
import { getTestAccessToken } from './access'

/** 为常规 API 测试签发真实测试 JWT；认证专项测试直接调用 app.request。 */
export async function authenticatedRequest(
  path: string,
  init: RequestInit = {},
  bindings: Env['Bindings'] = env,
) {
  const headers = new Headers(init.headers)
  headers.set('Cf-Access-Jwt-Assertion', await getTestAccessToken())
  return app.request(path, { ...init, headers }, bindings)
}

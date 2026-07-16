import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { app } from '../index'
import { getTestAccessToken } from '../testing/access'

describe('Cloudflare Access 认证', () => {
  it('缺少 Access JWT 时拒绝 API 请求', async () => {
    const response = await app.request('/api/templates', {}, env)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'ACCESS_TOKEN_REQUIRED' })
  })

  it('开发代理标记不能绕过非开发环境认证', async () => {
    const response = await app.request(
      '/api/templates',
      { headers: { 'X-Local-Dev-Session': 'vite-proxy' } },
      env,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'ACCESS_TOKEN_REQUIRED' })
  })

  it('开发环境允许 Vite 代理注入本地开发用户', async () => {
    const response = await app.request(
      '/api/templates',
      { headers: { 'X-Local-Dev-Session': 'vite-proxy' } },
      { ...env, ENVIRONMENT: 'development' },
    )

    expect(response.status).toBe(200)
  })

  it('无效 JWT 不能访问 API', async () => {
    const response = await app.request(
      '/api/templates',
      { headers: { 'Cf-Access-Jwt-Assertion': 'invalid-token' } },
      env,
    )
    expect(response.status).toBe(401)
  })

  it('aud 不匹配时拒绝请求', async () => {
    const response = await app.request(
      '/api/templates',
      {
        headers: {
          'Cf-Access-Jwt-Assertion': await getTestAccessToken({ audience: 'wrong-aud' }),
        },
      },
      env,
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' })
  })
})

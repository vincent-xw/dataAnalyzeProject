import { describe, expect, it } from 'vitest'

import { app } from './index'

describe('Worker 健康检查', () => {
  it('返回固定健康状态', async () => {
    const response = await app.request('/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

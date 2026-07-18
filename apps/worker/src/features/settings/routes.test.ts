import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { authenticatedRequest } from '../../testing/request'

describe('图表展示配置 API', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM system_analysis_display_settings').run()
  })

  it('返回默认配置并持久化更新', async () => {
    const initial = await authenticatedRequest('/api/settings/analysis-display', {}, env)
    expect(await initial.json()).toEqual({ chartsPerRow: 2, defaultRowHeight: 400 })

    const saved = await authenticatedRequest('/api/settings/analysis-display', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chartsPerRow: 3, defaultRowHeight: 480 }),
    }, env)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ chartsPerRow: 3, defaultRowHeight: 480 })

    const reloaded = await authenticatedRequest('/api/settings/analysis-display', {}, env)
    expect(await reloaded.json()).toEqual({ chartsPerRow: 3, defaultRowHeight: 480 })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from './client'

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DELETE 成功且响应为 204 空内容时正常返回', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)

    await expect(apiRequest<void>('/api/templates/template-1', { method: 'DELETE' })).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith('/api/templates/template-1', { method: 'DELETE' })
  })
})

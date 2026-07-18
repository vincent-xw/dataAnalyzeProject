import { Hono } from 'hono'
import { expect, it, vi } from 'vitest'

import type { Env } from '../index'
import { handleError, requestContext } from './error-handler'

it('未知错误返回关联 ID、不暴露堆栈并记录可定位原因', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const testApp = new Hono<Env>()
  testApp.use('*', requestContext())
  testApp.onError(handleError)
  testApp.get('/error', () => { throw new Error('包含内部堆栈') })
  const response = await testApp.request('/error')
  expect(response.status).toBe(500)
  const body = await response.json<{ code: string; requestId: string; stack?: string }>()
  expect(body.code).toBe('INTERNAL_ERROR')
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(body.stack).toBeUndefined()
  expect(log).toHaveBeenCalledWith(expect.stringContaining('Error: 包含内部堆栈'))
  log.mockRestore()
})

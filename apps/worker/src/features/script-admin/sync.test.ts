import { describe, expect, it, vi } from 'vitest'

import { syncScriptCatalog } from './sync'

describe('syncScriptCatalog', () => {
  it('在一个 D1 batch 中禁用旧版本并写入完整注册表', async () => {
    const bind = vi.fn(function (this: unknown) { return this })
    const prepare = vi.fn((_sql: string) => ({ bind }))
    const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [])
    const database = { prepare, batch } as unknown as D1Database

    const result = await syncScriptCatalog(database)

    expect(batch).toHaveBeenCalledOnce()
    expect(batch.mock.calls[0]?.[0]).toHaveLength(result.synced + 1)
    expect(prepare.mock.calls[0]?.[0]).toContain('UPDATE scripts SET enabled = 0')
  })

  it('注册表校验失败时不写 D1', async () => {
    const database = { prepare: vi.fn(), batch: vi.fn() } as unknown as D1Database
    await expect(syncScriptCatalog(database, [{ id: 'broken' }])).rejects.toThrow()
    expect(database.batch).not.toHaveBeenCalled()
  })
})

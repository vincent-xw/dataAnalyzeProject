import { spawn, spawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ kill: vi.fn(), on: vi.fn() })),
  spawnSync: vi.fn(),
}))

describe('start-dev-worker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(spawn).mockClear()
    vi.mocked(spawnSync).mockClear()
  })

  it('使用远端 Cloudflare 开发资源启动 Worker', async () => {
    await import('./start-dev-worker')

    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['--filter', '@data-analyze/worker', 'exec', 'wrangler', 'dev', '--remote', '--port', '8787', '--var', 'ENVIRONMENT:development'],
      { stdio: 'inherit' },
    )

    const arguments_ = vi.mocked(spawn).mock.calls[0]![1] as string[]
    expect(arguments_).not.toContain('--local')
    expect(arguments_).not.toContain('--persist-to')
  })
})

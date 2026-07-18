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

  it('使用本地 Worker 与远端 Cloudflare 绑定启动开发服务', async () => {
    await import('./start-dev-worker')

    expect(spawnSync).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith(
      'pnpm',
      ['--filter', '@data-analyze/worker', 'exec', 'wrangler', 'dev', '--port', '8787', '--var', 'ENVIRONMENT:development'],
      { stdio: 'inherit' },
    )

    const arguments_ = vi.mocked(spawn).mock.calls[0]![1] as string[]
    expect(arguments_).not.toContain('--local')
    expect(arguments_).not.toContain('--remote')
    expect(arguments_).not.toContain('--persist-to')
  })
})

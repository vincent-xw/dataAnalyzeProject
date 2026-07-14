import { describe, expect, it, vi } from 'vitest'

import { createScriptPullRequest, GitHubApiError } from './github'

const upload = {
  id: 'regional-sales',
  version: '1.1.0',
  source: "export const metadata = { id: 'regional-sales', version: '1.1.0' }; export const script = { metadata }",
}

const env = {
  GITHUB_TOKEN: 'secret-token',
  GITHUB_OWNER: 'owner',
  GITHUB_REPO: 'data-analyze',
  GITHUB_BASE_BRANCH: 'main',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createScriptPullRequest', () => {
  it('使用固定候选分支和目标目录创建 PR', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'base-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ ref: 'candidate-ref' }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          content: btoa("import type { DataProcessor } from '@data-analyze/script-sdk'\nconst scripts = new Map<string, DataProcessor<unknown>>([\n])"),
          sha: 'registry-sha',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: { path: 'script.ts' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ content: { path: 'registry.ts' } }))
      .mockResolvedValueOnce(jsonResponse({ html_url: 'https://github.com/owner/data-analyze/pull/12' }, 201))

    const result = await createScriptPullRequest(upload, env, fetcher)

    expect(result).toEqual({
      branch: 'script-candidate/regional-sales-1.1.0',
      path: 'packages/scripts/src/regional-sales/1.1.0.ts',
      pullRequestUrl: 'https://github.com/owner/data-analyze/pull/12',
    })
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain('script-candidate/regional-sales-1.1.0')
  })

  it.each([409, 500])('将 GitHub %s 响应转换为安全错误', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: 'failed' }, status))
    await expect(createScriptPullRequest(upload, env, fetcher)).rejects.toEqual(
      expect.objectContaining<Partial<GitHubApiError>>({ code: 'GITHUB_API_ERROR', status }),
    )
  })
})

import type { ScriptUploadRequest } from '@data-analyze/contracts'

export type GitHubBindings = {
  GITHUB_TOKEN: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  GITHUB_BASE_BRANCH: string
}

export type ScriptPullRequestResult = {
  branch: string
  path: string
  pullRequestUrl: string
}

export class GitHubApiError extends Error {
  readonly code = 'GITHUB_API_ERROR' as const

  constructor(readonly status: number, operation: string) {
    super(`GitHub 操作失败: ${operation}`)
  }
}

/** 使用浏览器兼容 API 对 UTF-8 GitHub Contents 内容编码。 */
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** 解码 GitHub Contents API 返回的 UTF-8 Base64 内容。 */
function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

/** 为候选脚本生成确定性的注册表导入和 Map 条目。 */
function updateRegistrySource(source: string, upload: ScriptUploadRequest): string {
  const alias = `candidate${upload.id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())}${upload.version.replace(/\./g, '_')}Script`
  const importLine = `import { script as ${alias} } from './${upload.id}/${upload.version}'\n`
  const marker = 'const scripts = new Map<string, DataProcessor<unknown>>([\n'
  if (!source.includes(marker)) throw new GitHubApiError(422, '更新脚本注册表')
  const entry = `  ['${upload.id}@${upload.version}', ${alias} as DataProcessor<unknown>],\n`
  return `${importLine}${source.replace(marker, `${marker}${entry}`)}`
}

/** 调用 GitHub API；错误中只保留状态码和操作名，绝不携带 Token 或响应正文。 */
async function githubRequest<T>(
  url: string,
  bindings: GitHubBindings,
  operation: string,
  fetcher: typeof fetch,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${bindings.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
  })
  if (!response.ok) throw new GitHubApiError(response.status, operation)
  return (await response.json()) as T
}

/** 创建候选分支、写入固定脚本路径、更新注册表并创建人工审核 PR。 */
export async function createScriptPullRequest(
  upload: ScriptUploadRequest,
  bindings: GitHubBindings,
  fetcher: typeof fetch = fetch,
): Promise<ScriptPullRequestResult> {
  const repositoryUrl = `https://api.github.com/repos/${bindings.GITHUB_OWNER}/${bindings.GITHUB_REPO}`
  const branch = `script-candidate/${upload.id}-${upload.version}`
  const path = `packages/scripts/src/${upload.id}/${upload.version}.ts`
  const registryPath = 'packages/scripts/src/registry.ts'

  const base = await githubRequest<{ object: { sha: string } }>(
    `${repositoryUrl}/git/ref/heads/${encodeURIComponent(bindings.GITHUB_BASE_BRANCH)}`,
    bindings,
    '读取基准分支',
    fetcher,
  )
  await githubRequest(
    `${repositoryUrl}/git/refs`,
    bindings,
    '创建候选分支',
    fetcher,
    { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }) },
  )
  const registry = await githubRequest<{ content: string; sha: string }>(
    `${repositoryUrl}/contents/${registryPath}?ref=${encodeURIComponent(branch)}`,
    bindings,
    '读取脚本注册表',
    fetcher,
  )
  await githubRequest(
    `${repositoryUrl}/contents/${path}`,
    bindings,
    '写入候选脚本',
    fetcher,
    {
      method: 'PUT',
      body: JSON.stringify({ message: `feat(script): add ${upload.id}@${upload.version}`, content: encodeBase64(upload.source), branch }),
    },
  )
  await githubRequest(
    `${repositoryUrl}/contents/${registryPath}`,
    bindings,
    '更新脚本注册表',
    fetcher,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: `feat(script): register ${upload.id}@${upload.version}`,
        content: encodeBase64(updateRegistrySource(decodeBase64(registry.content), upload)),
        sha: registry.sha,
        branch,
      }),
    },
  )
  const pullRequest = await githubRequest<{ html_url: string }>(
    `${repositoryUrl}/pulls`,
    bindings,
    '创建候选脚本 PR',
    fetcher,
    {
      method: 'POST',
      body: JSON.stringify({
        title: `feat(script): add ${upload.id}@${upload.version}`,
        head: branch,
        base: bindings.GITHUB_BASE_BRANCH,
        body: '候选脚本需通过 CI，并由仓库维护者人工审核后合并。',
      }),
    },
  )

  return { branch, path, pullRequestUrl: pullRequest.html_url }
}

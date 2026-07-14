import { ScriptUploadRequestSchema, type ScriptUploadRequest } from '@data-analyze/contracts'
import { listScriptMetadata } from '@data-analyze/scripts'
import { Hono } from 'hono'

import type { Env } from '../../index'
import {
  createScriptPullRequest,
  GitHubApiError,
  type GitHubBindings,
  type ScriptPullRequestResult,
} from './github'
import { syncScriptCatalog } from './sync'

type PullRequestCreator = (
  upload: ScriptUploadRequest,
  bindings: GitHubBindings,
) => Promise<ScriptPullRequestResult>

/** 创建隐藏脚本管理路由；依赖参数只用于测试真实业务分支，不绕过身份认证。 */
export function createScriptAdminRoutes(
  createPullRequest: PullRequestCreator = createScriptPullRequest,
): Hono<Env> {
  const routes = new Hono<Env>()

  routes.post('/candidates', async (context) => {
    const request = ScriptUploadRequestSchema.safeParse(await context.req.json().catch(() => null))
    if (!request.success) {
      return context.json(
        { code: 'INVALID_SCRIPT_UPLOAD', message: '候选脚本不符合上传协议', details: request.error.issues },
        400,
      )
    }

    // 构建期注册表是事实来源；已有精确 ID 与版本绝不允许被候选上传覆盖。
    const exists = listScriptMetadata().some(
      (metadata) => metadata.id === request.data.id && metadata.version === request.data.version,
    )
    if (exists) return context.json({ code: 'SCRIPT_VERSION_EXISTS', message: '脚本版本已存在' }, 409)

    try {
      const result = await createPullRequest(request.data, context.env)
      return context.json(
        { branch: result.branch, pullRequestUrl: result.pullRequestUrl, status: 'awaiting_ci' as const },
        201,
      )
    } catch (error) {
      if (error instanceof GitHubApiError) {
        return context.json({ code: error.code, message: error.message }, 502)
      }
      throw error
    }
  })

  routes.post('/sync', async (context) => {
    return context.json(await syncScriptCatalog(context.env.DB))
  })

  return routes
}

export const scriptAdminRoutes = createScriptAdminRoutes()

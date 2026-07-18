import { ScriptUploadRequestSchema } from '@data-analyze/contracts'
import { listScriptMetadata } from '@data-analyze/scripts'
import { Hono } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { syncScriptCatalog } from './sync'
import { generateCandidateDraft } from './generation'
import { LlmClientError } from '../llm/client'

/** 创建隐藏脚本管理路由；候选源码只保存为 R2 草稿，不能作为动态代码执行。 */
export function createScriptAdminRoutes(): Hono<Env> {
  const routes = new Hono<Env>()

  routes.post('/drafts', async (context) => {
    try {
      const draft = await generateCandidateDraft(await context.req.json().catch(() => null), context.env)
      return context.json(draft)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return context.json({ code: 'INVALID_DRAFT_REQUEST', message: '候选代码请求无效' }, 400)
      }
      if (error instanceof LlmClientError) {
        return context.json({ code: error.code, message: error.message }, 502)
      }
      throw error
    }
  })

  routes.post('/candidates', async (context) => {
    const request = ScriptUploadRequestSchema.safeParse(await context.req.json().catch(() => null))
    if (!request.success) {
      return context.json(
        { code: 'INVALID_SCRIPT_UPLOAD', message: '候选脚本不符合上传协议', details: request.error.issues },
        400,
      )
    }

    // 构建期注册表仍是已发布脚本的事实来源，草稿不能伪装为已发布版本。
    const exists = listScriptMetadata().some(
      (metadata) => metadata.id === request.data.id && metadata.version === request.data.version,
    )
    if (exists) return context.json({ code: 'SCRIPT_VERSION_EXISTS', message: '脚本版本已存在' }, 409)

    const id = crypto.randomUUID()
    const objectKey = `data-analyze/script-drafts/${id}/source.ts`
    await context.env.DATA_BUCKET.put(objectKey, request.data.source, {
      httpMetadata: { contentType: 'text/typescript; charset=utf-8' },
      customMetadata: { scriptId: request.data.id, scriptVersion: request.data.version },
    })
    return context.json({ id, objectKey, status: 'stored' as const }, 201)
  })

  routes.post('/sync', async (context) => {
    return context.json(await syncScriptCatalog(context.env.DB))
  })

  return routes
}

export const scriptAdminRoutes = createScriptAdminRoutes()

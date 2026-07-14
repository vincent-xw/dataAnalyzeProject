import type { Context, ErrorHandler, MiddlewareHandler } from 'hono'

import type { Env } from '../index'
import { AppError } from '../lib/errors'
import { createLogger } from '../lib/logger'

/** 为每次请求生成关联 ID，并为全部 JSON 错误响应补齐该 ID。 */
export function requestContext(): MiddlewareHandler<Env> {
  return async (context, next) => {
    const requestId = crypto.randomUUID()
    context.set('requestId', requestId)
    await next()
    context.header('x-request-id', requestId)

    if (context.res.status < 400 || !context.res.headers.get('content-type')?.includes('application/json')) return
    const body: unknown = await context.res.clone().json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body) || 'requestId' in body) return
    const headers = new Headers(context.res.headers)
    context.res = new Response(JSON.stringify({ ...body, requestId }), {
      status: context.res.status,
      headers,
    })
  }
}

/** 将未捕获错误转换成不含堆栈和内部数据的统一响应。 */
export const handleError: ErrorHandler<Env> = (error, context) => {
  const requestId = context.get('requestId')
  const appError = error instanceof AppError
    ? error
    : new AppError('INTERNAL_ERROR', '服务处理请求时发生错误', 500)
  createLogger({ requestId }).error('请求处理失败', { errorCode: appError.code })
  return errorResponse(context, appError, requestId)
}

function errorResponse(context: Context<Env>, error: AppError, requestId: string) {
  return context.json(
    {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    },
    error.status as 400,
  )
}

import { Hono, type Context } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { ReportLlmError, ReportService, ReportServiceError } from './service'

const CreateReportRequestSchema = z
  .object({
    promptVersionId: z.string().uuid(),
    userRequirement: z.string().min(1),
  })
  .strict()

export const taskReportRoutes = new Hono<Env>()
export const reportVersionRoutes = new Hono<Env>()

taskReportRoutes.get('/:taskId/report-context', async (context) => {
  try {
    return context.json(await new ReportService(context.env).getContext(context.req.param('taskId')))
  } catch (error) {
    return handleReportError(context, error)
  }
})

taskReportRoutes.post('/:taskId/reports', async (context) => {
  const request = CreateReportRequestSchema.safeParse(await context.req.json().catch(() => undefined))
  if (!request.success) {
    return context.json({ code: 'INVALID_REQUEST', message: '报表草稿请求无效' }, 400)
  }
  try {
    return context.json(
      await new ReportService(context.env).createDraft(
        context.req.param('taskId'),
        request.data.promptVersionId,
        request.data.userRequirement,
      ),
      201,
    )
  } catch (error) {
    return handleReportError(context, error)
  }
})

reportVersionRoutes.get('/:id/data', async (context) => {
  try {
    const object = await new ReportService(context.env).getDataObject(context.req.param('id'))
    return new Response(object.body, {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  } catch (error) {
    return handleReportError(context, error)
  }
})

reportVersionRoutes.post('/:id/confirm', async (context) => {
  try {
    return context.json(await new ReportService(context.env).confirm(context.req.param('id')))
  } catch (error) {
    return handleReportError(context, error)
  }
})

reportVersionRoutes.get('/:id', async (context) => {
  try {
    const report = await new ReportService(context.env).get(context.req.param('id'))
    if (!report) {
      return context.json({ code: 'REPORT_VERSION_NOT_FOUND', message: '报表版本不存在' }, 404)
    }
    return context.json(report)
  } catch (error) {
    return handleReportError(context, error)
  }
})

function handleReportError(context: Context<Env>, error: unknown) {
  if (error instanceof ReportServiceError) {
    return context.json(
      { code: error.code, message: error.message, details: error.details },
      error.status,
    )
  }
  if (error instanceof ReportLlmError) {
    const status = error.code === 'LLM_REQUEST_TIMEOUT' ? 504 : 502
    return context.json({ code: error.code, message: error.message }, status)
  }
  throw error
}

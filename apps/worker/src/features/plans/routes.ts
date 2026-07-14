import { Hono, type Context } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { LlmClientError } from '../llm/client'
import { PlanService, PlanServiceError } from './service'

const CreatePlanRequestSchema = z
  .object({
    promptVersionId: z.string().uuid(),
    userRequirement: z.string().min(1),
  })
  .strict()

export const datasetVersionPlanRoutes = new Hono<Env>()
export const planRoutes = new Hono<Env>()

datasetVersionPlanRoutes.post('/:id/plans', async (context) => {
  const request = CreatePlanRequestSchema.safeParse(await context.req.json().catch(() => undefined))
  if (!request.success) {
    return context.json({ code: 'INVALID_REQUEST', message: '执行计划请求无效' }, 400)
  }
  try {
    const service = new PlanService(context.env)
    return context.json(
      await service.create(
        context.req.param('id'),
        request.data.promptVersionId,
        request.data.userRequirement,
      ),
      201,
    )
  } catch (error) {
    return handlePlanError(context, error)
  }
})

planRoutes.get('/:id', async (context) => {
  const service = new PlanService(context.env)
  const plan = await service.get(context.req.param('id'))
  if (!plan) return context.json({ code: 'PLAN_NOT_FOUND', message: '执行计划不存在' }, 404)
  return context.json(plan)
})

planRoutes.post('/:id/confirm', async (context) => {
  try {
    const service = new PlanService(context.env)
    return context.json(await service.confirm(context.req.param('id')), 202)
  } catch (error) {
    return handlePlanError(context, error)
  }
})

function handlePlanError(context: Context<Env>, error: unknown) {
  if (error instanceof PlanServiceError) {
    return context.json({ code: error.code, message: error.message }, error.status)
  }
  if (error instanceof LlmClientError) {
    const status = error.code === 'LLM_REQUEST_TIMEOUT' ? 504 : 502
    return context.json({ code: error.code, message: error.message }, status)
  }
  throw error
}

import { FieldDefinitionSchema, PromptTypeSchema } from '@data-analyze/contracts'
import { Hono } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { TemplateService } from './service'

const UniqueFieldsSchema = z.array(FieldDefinitionSchema).min(1).superRefine((fields, context) => {
  const names = new Set<string>()
  fields.forEach((field, index) => {
    if (names.has(field.name)) {
      context.addIssue({ code: 'custom', message: `模板字段名重复: ${field.name}`, path: [index] })
    }
    names.add(field.name)
  })
})

const CreateTemplateRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fields: UniqueFieldsSchema,
  processingPrompt: z.string().min(1),
  reportingPrompt: z.string().min(1),
})

const CreatePromptRequestSchema = z.object({
  type: PromptTypeSchema,
  content: z.string().min(1),
})

export const templateRoutes = new Hono<Env>()

templateRoutes.post('/', async (context) => {
  const request = CreateTemplateRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) {
    return context.json(
      { code: 'INVALID_REQUEST', message: '请求参数不符合模板协议', details: request.error.issues },
      400,
    )
  }

  const service = new TemplateService(context.env.DB)
  return context.json(await service.create(request.data), 201)
})

templateRoutes.get('/', async (context) => {
  const service = new TemplateService(context.env.DB)
  return context.json(await service.list())
})

templateRoutes.post('/:id/prompts', async (context) => {
  const request = CreatePromptRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) {
    return context.json(
      { code: 'INVALID_REQUEST', message: '请求参数不符合 Prompt 协议', details: request.error.issues },
      400,
    )
  }

  const service = new TemplateService(context.env.DB)
  const prompt = await service.createPromptVersion(
    context.req.param('id'),
    request.data.type,
    request.data.content,
  )
  if (!prompt) return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
  return context.json(prompt, 201)
})

templateRoutes.get('/:id', async (context) => {
  const service = new TemplateService(context.env.DB)
  const template = await service.get(context.req.param('id'))
  if (!template) return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
  return context.json(template)
})

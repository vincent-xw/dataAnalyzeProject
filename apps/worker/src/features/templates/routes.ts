import { FieldDefinitionSchema, FieldGenerationRequestSchema, PromptTypeSchema } from '@data-analyze/contracts'
import { Hono } from 'hono'
import { z } from 'zod'

import type { Env } from '../../index'
import { TemplateService } from './service'
import { LlmClientError, requestFieldDefinitions } from '../llm/client'
import { inspectCsv } from '../datasets/inspect-csv'
import { inspectXlsx } from '../datasets/inspect-xlsx'
import { decodeUploadHeader, MAX_FILE_SIZE, parseSourceInspectionMetadata, UploadRequestError } from '../datasets/upload'

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

templateRoutes.post('/inspect-source', async (context) => {
  try {
    const metadata = parseSourceInspectionMetadata(context.req.raw.headers)
    const content = await context.req.arrayBuffer()
    if (content.byteLength === 0) {
      throw new UploadRequestError('INVALID_CONTENT_LENGTH', '文件不能为空', 400)
    }
    if (content.byteLength > MAX_FILE_SIZE) {
      throw new UploadRequestError('FILE_TOO_LARGE', '文件不能超过 10 MB', 413)
    }
    if (metadata.fileType === 'csv') {
      const inspection = await inspectCsv(
        content,
        (context.req.header('x-csv-encoding') || 'utf-8') as 'utf-8' | 'utf-8-bom' | 'gb18030',
        (context.req.header('x-csv-delimiter') || ',') as ',' | '\t' | ';',
      )
      return context.json({ status: 'inspected' as const, inspection })
    }
    const selectedSheetHeader = context.req.header('x-selected-sheet')
    const selectedSheet = selectedSheetHeader ? decodeUploadHeader(selectedSheetHeader, '工作表') : undefined
    const result = inspectXlsx(content, selectedSheet)
    if (result.status === 'awaiting_sheet' && result.sheets.length === 1) {
      return context.json(inspectXlsx(content, result.sheets[0]))
    }
    return context.json(result)
  } catch (error) {
    if (error instanceof UploadRequestError || error instanceof Error && 'code' in error) {
      const typed = error as { code: string; message: string; status?: number }
      return context.json({ code: typed.code, message: typed.message }, (typed.status || 400) as 400)
    }
    throw error
  }
})

templateRoutes.post('/generate-fields', async (context) => {
  const request = FieldGenerationRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) return context.json({ code: 'INVALID_REQUEST', message: '表头检查结果不符合标准字段生成协议', details: request.error.issues }, 400)
  try {
    const fields = await requestFieldDefinitions(request.data.inspection, context.env, request.data.instruction)
    return context.json({ fields })
  } catch (error) {
    if (error instanceof LlmClientError) {
      const response = toTemplateLlmErrorResponse(error)
      return context.json(response.body, response.status)
    }
    throw error
  }
})

export function toTemplateLlmErrorResponse(error: LlmClientError) {
  return {
    status: error.code === 'LLM_REQUEST_TIMEOUT' ? 504 : 502,
    body: { code: error.code, message: error.message },
  } as const
}

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

templateRoutes.put('/:id', async (context) => {
  const request = CreateTemplateRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) {
    return context.json(
      { code: 'INVALID_REQUEST', message: '请求参数不符合模板协议', details: request.error.issues },
      400,
    )
  }

  const template = await new TemplateService(context.env.DB).update(context.req.param('id'), request.data)
  if (!template) return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
  return context.json(template)
})

templateRoutes.delete('/:id', async (context) => {
  const result = await new TemplateService(context.env.DB).remove(context.req.param('id'))
  if (result === 'in_use') {
    return context.json(
      { code: 'TEMPLATE_IN_USE', message: '模板已被数据集、字段映射或数据资产引用，不能删除' },
      409,
    )
  }
  if (result === 'not_found') {
    return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
  }
  return context.body(null, 204)
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

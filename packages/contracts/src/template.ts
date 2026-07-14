import { z } from 'zod'

import { FieldDefinitionSchema } from './dataset'

const UniqueFieldListSchema = z
  .array(FieldDefinitionSchema)
  .min(1)
  .superRefine((fields, context) => {
    // 模板字段名必须唯一，否则字段映射和脚本输入将产生歧义。
    const names = new Set<string>()
    fields.forEach((field, index) => {
      if (names.has(field.name)) {
        context.addIssue({
          code: 'custom',
          message: `模板字段名重复: ${field.name}`,
          path: [index, 'name'],
        })
      }
      names.add(field.name)
    })
  })

export const AnalysisTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().min(1),
  fields: UniqueFieldListSchema,
  processingPromptVersionId: z.string().uuid(),
  reportingPromptVersionId: z.string().uuid(),
})

export const PromptTypeSchema = z.enum(['processing', 'reporting'])

export const PromptVersionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  type: PromptTypeSchema,
  version: z.number().int().positive(),
  content: z.string().min(1),
  createdAt: z.string().datetime(),
})

export type AnalysisTemplate = z.infer<typeof AnalysisTemplateSchema>
export type PromptType = z.infer<typeof PromptTypeSchema>
export type PromptVersion = z.infer<typeof PromptVersionSchema>

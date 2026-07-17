import { z } from 'zod'

export const FieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date'])

export const FieldDefinitionSchema = z.object({
  // 保留上传表格的原始表头，界面展示与自动映射均以此字段为准。
  sourceLabel: z.string().min(1),
  name: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
})

export const FieldMappingSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
})

export const FieldMappingListSchema = z
  .array(FieldMappingSchema)
  .superRefine((mappings, context) => {
    // 显式保证一一映射，避免字段覆盖或一个来源值承担多个业务含义。
    const sourceFields = new Set<string>()
    const targetFields = new Set<string>()

    mappings.forEach((mapping, index) => {
      if (sourceFields.has(mapping.sourceField)) {
        context.addIssue({
          code: 'custom',
          message: `来源字段重复映射: ${mapping.sourceField}`,
          path: [index, 'sourceField'],
        })
      }
      if (targetFields.has(mapping.targetField)) {
        context.addIssue({
          code: 'custom',
          message: `标准字段重复映射: ${mapping.targetField}`,
          path: [index, 'targetField'],
        })
      }

      sourceFields.add(mapping.sourceField)
      targetFields.add(mapping.targetField)
    })
  })

export const DatasetInspectionSchema = z.object({
  rowCount: z.number().int().min(0).max(100_000),
  columnCount: z.number().int().min(1).max(200),
  sheets: z.array(z.string().min(1)),
  sourceFields: z.array(z.string().min(1)).max(200),
})

export const FieldGenerationRequestSchema = z.object({
  inspection: DatasetInspectionSchema,
  instruction: z.string().max(2000).optional(),
})

export type FieldType = z.infer<typeof FieldTypeSchema>
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type FieldMapping = z.infer<typeof FieldMappingSchema>
export type DatasetInspection = z.infer<typeof DatasetInspectionSchema>
export type FieldGenerationRequest = z.infer<typeof FieldGenerationRequestSchema>

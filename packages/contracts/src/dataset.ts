import { z } from 'zod'

export const FieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date'])

export const FieldDefinitionSchema = z.object({
  name: z.string().min(1),
  type: FieldTypeSchema,
  description: z.string().min(1),
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

export type FieldType = z.infer<typeof FieldTypeSchema>
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>
export type FieldMapping = z.infer<typeof FieldMappingSchema>
export type DatasetInspection = z.infer<typeof DatasetInspectionSchema>

import type { FieldDefinition, FieldMapping } from '@data-analyze/contracts'

export type MappingValidationResult = {
  unknownSources: FieldMapping[]
  unknownTargets: FieldMapping[]
  missingRequired: string[]
}
/**
 * 只验证用户明确提交的映射，不猜测相似字段，也不为缺失的必填字段提供兜底值。
 */
export function validateMapping(
  sourceFields: string[],
  templateFields: FieldDefinition[],
  mappings: FieldMapping[],
): MappingValidationResult {
  const unknownSources = mappings.filter((item) => !sourceFields.includes(item.sourceField))
  const unknownTargets = mappings.filter(
    (item) => !templateFields.some((field) => field.name === item.targetField),
  )
  const mappedTargets = new Set(mappings.map((item) => item.targetField))
  const missingRequired = templateFields
    .filter((field) => field.required && !mappedTargets.has(field.name))
    .map((field) => field.name)

  return { unknownSources, unknownTargets, missingRequired }
}

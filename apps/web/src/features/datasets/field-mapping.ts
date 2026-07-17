import type { FieldDefinition } from '@data-analyze/contracts'

type MappingCandidate = {
  sourceField: string
  targetField?: string
}

/** 统一中英文表头的常见书写差异，避免把非完全相同的业务词语误认为同一字段。 */
function normalizeFieldLabel(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * 仅建议明确的一对一映射：任一来源字段有多个候选，或多个来源字段竞争同一目标时均不预选。
 */
export function createSuggestedTargets(
  sourceFields: string[],
  templateFields: FieldDefinition[],
): Record<string, string> {
  const candidates: MappingCandidate[] = sourceFields.map((sourceField) => {
    const normalizedSource = normalizeFieldLabel(sourceField)
    const matches = templateFields.filter((field) =>
      [field.name, field.sourceLabel].some((label) => normalizeFieldLabel(label) === normalizedSource),
    )
    return { sourceField, targetField: matches.length === 1 ? matches[0].name : undefined }
  })

  const targetCounts = new Map<string, number>()
  for (const candidate of candidates) {
    if (!candidate.targetField) continue
    targetCounts.set(candidate.targetField, (targetCounts.get(candidate.targetField) ?? 0) + 1)
  }

  return candidates.reduce<Record<string, string>>((targets, candidate) => {
    if (candidate.targetField && targetCounts.get(candidate.targetField) === 1) {
      targets[candidate.sourceField] = candidate.targetField
    }
    return targets
  }, {})
}

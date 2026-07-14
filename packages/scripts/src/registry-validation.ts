import { ScriptMetadataSchema, type ScriptMetadata } from '@data-analyze/contracts'

/** 校验单组字段名唯一，避免脚本协议在映射和报表阶段产生歧义。 */
function assertUniqueFields(
  fields: ScriptMetadata['inputFields'],
  errorCode: 'DUPLICATE_INPUT_FIELD' | 'DUPLICATE_OUTPUT_FIELD',
) {
  const names = new Set<string>()
  for (const field of fields) {
    if (names.has(field.name)) throw new Error(errorCode)
    names.add(field.name)
  }
}

/** 在任何 D1 写入或部署前完整校验构建期脚本注册表。 */
export function validateScriptRegistry(entries: readonly unknown[]): ScriptMetadata[] {
  const versions = new Set<string>()
  return entries.map((entry) => {
    const metadata = ScriptMetadataSchema.parse(entry)
    const key = `${metadata.id}@${metadata.version}`
    if (versions.has(key)) throw new Error('DUPLICATE_SCRIPT_VERSION')
    versions.add(key)
    assertUniqueFields(metadata.inputFields, 'DUPLICATE_INPUT_FIELD')
    assertUniqueFields(metadata.outputFields, 'DUPLICATE_OUTPUT_FIELD')
    return metadata
  })
}

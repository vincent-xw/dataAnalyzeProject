import type { ScriptMetadata } from '../packages/contracts/src/script'
import { listScriptMetadata, validateScriptRegistry } from '../packages/scripts/src/registry'

/** 对外保留独立校验入口，供测试和 CI 使用。 */
export function validateRegistry(entries: readonly unknown[]): ScriptMetadata[] {
  return validateScriptRegistry(entries)
}

validateRegistry(listScriptMetadata())
console.log('脚本注册表校验通过')

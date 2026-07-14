import type { ScriptMetadata } from '@data-analyze/contracts'
import type { DataProcessor } from '@data-analyze/script-sdk'

import { salesRegionSummary } from './sales-region-summary'
export { validateScriptRegistry } from './registry-validation'

const scripts = new Map<string, DataProcessor<unknown>>([
  [
    `${salesRegionSummary.metadata.id}@${salesRegionSummary.metadata.version}`,
    salesRegionSummary as DataProcessor<unknown>,
  ],
])

export function getScript(id: string, version: string): DataProcessor<unknown> {
  const script = scripts.get(`${id}@${version}`)
  if (!script) throw new Error('SCRIPT_NOT_FOUND')
  return script
}

export function listScriptMetadata(): ScriptMetadata[] {
  return [...scripts.values()].map((script) => script.metadata)
}

export { salesRegionSummary }

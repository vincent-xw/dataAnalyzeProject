import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  analysisTemplates,
  datasetVersions,
  datasets,
  fieldMappings,
  promptVersions,
} from './schema'

describe('D1 控制面结构', () => {
  it('使用固定表名', () => {
    expect(getTableName(analysisTemplates)).toBe('analysis_templates')
    expect(getTableName(promptVersions)).toBe('prompt_versions')
    expect(getTableName(datasets)).toBe('datasets')
    expect(getTableName(datasetVersions)).toBe('dataset_versions')
    expect(getTableName(fieldMappings)).toBe('field_mappings')
  })
})

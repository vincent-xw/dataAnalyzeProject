import { describe, expect, it } from 'vitest'

import { getScript, listScriptMetadata } from './registry'

describe('版本化脚本注册表', () => {
  it('按精确 ID 和版本读取脚本', () => {
    expect(getScript('sales-region-summary', '1.0.0').metadata.name).toBe('区域销售汇总')
    expect(() => getScript('sales-region-summary', '9.9.9')).toThrow('SCRIPT_NOT_FOUND')
  })

  it('只暴露可序列化元数据', () => {
    expect(() => JSON.stringify(listScriptMetadata())).not.toThrow()
  })
})

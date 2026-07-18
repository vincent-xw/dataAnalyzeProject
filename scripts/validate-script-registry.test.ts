import type { ScriptMetadata } from '../packages/contracts/src/script'
import { describe, expect, it } from 'vitest'

import { validateRegistry } from './validate-script-registry'

const metadata: ScriptMetadata = {
  id: 'regional-sales',
  version: '1.0.0',
  name: '区域销售',
  description: '汇总区域销售数据',
  inputFields: [{ name: 'region', type: 'string', sourceLabel: '区域', required: true }],
  outputFields: [{ name: 'total', type: 'number', sourceLabel: '金额', required: true }],
  parameterSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
}

describe('validateRegistry', () => {
  it('接受唯一且协议有效的注册表', () => {
    expect(validateRegistry([metadata])).toEqual([metadata])
  })

  it('拒绝重复 ID 和版本', () => {
    expect(() => validateRegistry([metadata, metadata])).toThrow('DUPLICATE_SCRIPT_VERSION')
  })

  it('拒绝重复输入字段', () => {
    expect(() => validateRegistry([{ ...metadata, inputFields: [metadata.inputFields[0]!, metadata.inputFields[0]!] }])).toThrow('DUPLICATE_INPUT_FIELD')
  })
})

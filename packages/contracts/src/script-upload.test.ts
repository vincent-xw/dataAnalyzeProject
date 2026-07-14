import { describe, expect, it } from 'vitest'

import { ScriptUploadRequestSchema } from './script-upload'

const validSource = `
export const metadata = {
  id: 'regional-sales',
  version: '1.1.0',
}
export const script = { metadata }
`

describe('ScriptUploadRequestSchema', () => {
  it('接受 metadata 与请求一致的候选脚本', () => {
    expect(
      ScriptUploadRequestSchema.parse({
        id: 'regional-sales',
        version: '1.1.0',
        source: validSource,
      }),
    ).toMatchObject({ id: 'regional-sales', version: '1.1.0' })
  })

  it('拒绝脚本 ID 中的路径字符', () => {
    const result = ScriptUploadRequestSchema.safeParse({
      id: '../escape',
      version: '1.0.0',
      source: validSource,
    })
    expect(result.success).toBe(false)
  })

  it('拒绝超过 256KB 的源码', () => {
    const result = ScriptUploadRequestSchema.safeParse({
      id: 'regional-sales',
      version: '1.1.0',
      source: `${validSource}${'x'.repeat(256 * 1024)}`,
    })
    expect(result.success).toBe(false)
  })

  it('拒绝 metadata 与请求版本不一致的源码', () => {
    const result = ScriptUploadRequestSchema.safeParse({
      id: 'regional-sales',
      version: '1.2.0',
      source: validSource,
    })
    expect(result.success).toBe(false)
  })
})

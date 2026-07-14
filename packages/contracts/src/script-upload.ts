import { z } from 'zod'

const MAX_SCRIPT_BYTES = 256 * 1024
const ScriptIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)

/** 从可信候选源码中读取 metadata 的固定字段，编译与注册表校验仍由 CI 完成。 */
function extractMetadataValue(source: string, field: 'id' | 'version'): string | undefined {
  const match = source.match(new RegExp(`\\b${field}\\s*:\\s*['\"]([^'\"]+)['\"]`))
  return match?.[1]
}

export const ScriptUploadRequestSchema = z
  .object({
    id: ScriptIdSchema,
    version: SemanticVersionSchema,
    source: z.string().min(1),
  })
  .strict()
  .superRefine((upload, context) => {
    if (new TextEncoder().encode(upload.source).byteLength > MAX_SCRIPT_BYTES) {
      context.addIssue({ code: 'custom', path: ['source'], message: '脚本源码不得超过 256KB' })
    }

    // 不为缺失 metadata 提供兜底；候选源码必须明确声明与请求完全一致的身份。
    if (extractMetadataValue(upload.source, 'id') !== upload.id) {
      context.addIssue({ code: 'custom', path: ['source'], message: 'metadata.id 与请求不一致' })
    }
    if (extractMetadataValue(upload.source, 'version') !== upload.version) {
      context.addIssue({ code: 'custom', path: ['source'], message: 'metadata.version 与请求不一致' })
    }
    if (!/\bexport\s+const\s+script\b/.test(upload.source)) {
      context.addIssue({ code: 'custom', path: ['source'], message: '源码必须导出 const script' })
    }
  })

export type ScriptUploadRequest = z.infer<typeof ScriptUploadRequestSchema>

import type { OutputWriter, StandardRecord } from '@data-analyze/script-sdk'

import { TaskExecutionError } from './normalize'

export type StreamingOutputWriter = OutputWriter & {
  readonly rowCount: number
  close(): Promise<void>
  abort(): Promise<void>
}

export type R2NdjsonSink = {
  write(record: StandardRecord): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024

/**
 * R2 普通 put 要求已知流长度；Multipart Upload 允许未知总量。除末片外累计到至少
 * 5 MiB 才上传，使内存保持有界并满足 R2 分片约束。
 */
export function createR2NdjsonSink(bucket: R2Bucket, objectKey: string): R2NdjsonSink {
  const multipartPromise = bucket.createMultipartUpload(objectKey, {
    httpMetadata: { contentType: 'application/x-ndjson' },
  })
  const uploadedParts: R2UploadedPart[] = []
  let chunks: Uint8Array[] = []
  let bufferedBytes = 0
  let partNumber = 1
  let settled = false

  async function flush() {
    if (bufferedBytes === 0) return
    const combined = new Uint8Array(bufferedBytes)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }
    const multipart = await multipartPromise
    uploadedParts.push(await multipart.uploadPart(partNumber, combined))
    partNumber += 1
    chunks = []
    bufferedBytes = 0
  }

  return {
    async write(record) {
      const chunk = new TextEncoder().encode(`${JSON.stringify(record)}\n`)
      chunks.push(chunk)
      bufferedBytes += chunk.byteLength
      if (bufferedBytes >= MIN_MULTIPART_PART_SIZE) await flush()
    },
    async close() {
      if (settled) return
      settled = true
      const multipart = await multipartPromise
      if (bufferedBytes === 0 && uploadedParts.length === 0) {
        await multipart.abort()
        await bucket.put(objectKey, '', {
          httpMetadata: { contentType: 'application/x-ndjson' },
        })
        return
      }
      await flush()
      await multipart.complete(uploadedParts)
    },
    async abort() {
      if (settled) return
      settled = true
      await (await multipartPromise).abort().catch(() => undefined)
      await bucket.delete(objectKey).catch(() => undefined)
    },
  }
}

/**
 * 每条输出先经过脚本 Schema 校验再进入 R2 流；R2 put 失败只标记为暂时性基础设施错误。
 */
export function createOutputWriter(
  bucket: R2Bucket,
  objectKey: string,
  parseOutput: (record: unknown) => StandardRecord,
): StreamingOutputWriter {
  const sink = createR2NdjsonSink(bucket, objectKey)
  let rowCount = 0
  let settled = false

  return {
    get rowCount() {
      return rowCount
    },
    async write(record) {
      let validated: StandardRecord
      try {
        validated = parseOutput(record)
      } catch (error) {
        if (error instanceof TaskExecutionError) throw error
        throw new TaskExecutionError('SCRIPT_OUTPUT_INVALID', '脚本输出不符合 Schema', false)
      }
      await sink.write(validated)
      rowCount += 1
    },
    async close() {
      if (settled) return
      settled = true
      try {
        await sink.close()
      } catch {
        throw new TaskExecutionError('R2_WRITE_FAILED', '结果流写入 R2 失败', true)
      }
    },
    async abort() {
      if (settled) return
      settled = true
      await sink.abort()
    },
  }
}

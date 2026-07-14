import type { StandardRecord } from '@data-analyze/script-sdk'

export class ReportMaterializationError extends Error {
  constructor(
    readonly code:
      | 'REPORT_TABLE_ROW_LIMIT_EXCEEDED'
      | 'REPORT_DATA_SIZE_EXCEEDED'
      | 'REPORT_SOURCE_INVALID',
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

/** 逐块解码任务 NDJSON，保留半行缓冲，不一次性加载整个结果对象。 */
export async function* readNdjsonRecords(object: R2ObjectBody): AsyncGenerator<StandardRecord> {
  const reader = object.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  function parseLine(line: string): StandardRecord {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new ReportMaterializationError('REPORT_SOURCE_INVALID', '任务结果包含非法 NDJSON')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ReportMaterializationError('REPORT_SOURCE_INVALID', '任务结果行必须是对象')
    }
    for (const fieldValue of Object.values(value)) {
      if (
        !['string', 'number', 'boolean'].includes(typeof fieldValue) ||
        (typeof fieldValue === 'number' && !Number.isFinite(fieldValue))
      ) {
        throw new ReportMaterializationError('REPORT_SOURCE_INVALID', '任务结果字段类型无效')
      }
    }
    return value as StandardRecord
  }

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    pending += decoder.decode(chunk.value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) yield parseLine(line)
    }
  }
  pending += decoder.decode()
  if (pending.length > 0) yield parseLine(pending)
}

const MAX_REPORT_BYTES = 5 * 1024 * 1024
const MAX_REPORT_ROWS = 10_000

/**
 * 在正式 R2 写入前逐行累计最终 JSON 数组的精确 UTF-8 字节，超限即终止且不写部分对象。
 */
export async function materializeReportData(
  input: AsyncIterable<StandardRecord>,
  bucket: R2Bucket,
  reportId: string,
  version: number,
) {
  const rows: StandardRecord[] = []
  let byteSize = 2
  for await (const record of input) {
    if (rows.length >= MAX_REPORT_ROWS) {
      throw new ReportMaterializationError(
        'REPORT_TABLE_ROW_LIMIT_EXCEEDED',
        '报表数据不能超过 10,000 行',
      )
    }
    const serialized = JSON.stringify(record)
    const rowBytes = new TextEncoder().encode(serialized).byteLength
    const nextByteSize = byteSize + rowBytes + (rows.length > 0 ? 1 : 0)
    if (nextByteSize > MAX_REPORT_BYTES) {
      throw new ReportMaterializationError(
        'REPORT_DATA_SIZE_EXCEEDED',
        '报表数据不能超过 5 MB',
      )
    }
    rows.push(record)
    byteSize = nextByteSize
  }

  const dataKey = `data-analyze/reports/${reportId}/${version}/data.json`
  await bucket.put(dataKey, JSON.stringify(rows), {
    httpMetadata: { contentType: 'application/json' },
  })
  return { dataKey, rowCount: rows.length, byteSize, data: rows }
}

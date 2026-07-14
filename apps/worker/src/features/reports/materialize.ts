import type { StandardRecord } from '@data-analyze/script-sdk'

export class ReportMaterializationError extends Error {
  constructor(
    readonly code: 'REPORT_TABLE_ROW_LIMIT_EXCEEDED' | 'REPORT_DATA_SIZE_EXCEEDED',
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
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

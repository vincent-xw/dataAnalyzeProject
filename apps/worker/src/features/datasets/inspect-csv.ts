import { parse } from 'csv-parse'
import iconv from 'iconv-lite'

import type { DatasetInspection } from '@data-analyze/contracts'

export type CsvEncoding = 'utf-8' | 'utf-8-bom' | 'gb18030'
export type CsvDelimiter = ',' | '\t' | ';'

export class InspectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * 解析 CSV 表头和行数。原始文件已经限制为 10 MB；循环仍会在越界瞬间终止，
 * 避免对已知无效文件继续消耗 Worker CPU 和内存。
 */
export async function inspectCsv(
  content: ArrayBuffer,
  encoding: CsvEncoding,
  delimiter: CsvDelimiter,
): Promise<DatasetInspection> {
  const decoded = iconv.decode(
    new Uint8Array(content),
    encoding === 'utf-8-bom' ? 'utf-8' : encoding,
  )
  const text = encoding === 'utf-8-bom' ? decoded.replace(/^\uFEFF/, '') : decoded
  const parser = parse(text, {
    delimiter,
    skip_empty_lines: true,
  })

  let sourceFields: string[] | undefined
  let rowCount = 0

  for await (const record of parser as unknown as AsyncIterable<string[]>) {
    if (!sourceFields) {
      sourceFields = record.map((field) => field.trim())
      if (sourceFields.length > 200) {
        throw new InspectionError('COLUMN_LIMIT_EXCEEDED', 'CSV 不能超过 200 列')
      }
      if (sourceFields.length === 0 || sourceFields.some((field) => field.length === 0)) {
        throw new InspectionError('INVALID_HEADER', 'CSV 表头不能为空')
      }
      if (new Set(sourceFields).size !== sourceFields.length) {
        throw new InspectionError('DUPLICATE_HEADER', 'CSV 表头不能重复')
      }
      continue
    }

    if (record.length !== sourceFields.length) {
      throw new InspectionError('INCONSISTENT_COLUMNS', 'CSV 数据行列数与表头不一致')
    }

    rowCount += 1
    if (rowCount > 100_000) {
      throw new InspectionError('ROW_LIMIT_EXCEEDED', 'CSV 不能超过 10 万行')
    }
  }

  if (!sourceFields) {
    throw new InspectionError('EMPTY_FILE', 'CSV 至少需要一行表头')
  }

  return {
    rowCount,
    columnCount: sourceFields.length,
    sheets: [],
    sourceFields,
  }
}

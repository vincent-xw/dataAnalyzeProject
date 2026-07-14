import { parse } from 'csv-parse'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

import type { FieldType } from '@data-analyze/contracts'
import type { StandardRecord, StandardValue } from '@data-analyze/script-sdk'

export class TaskExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

export type RuntimeFieldMapping = {
  sourceField: string
  targetField: string
  targetType: FieldType
}

const numberPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 类型转换只接受协议列出的完整格式，不 trim、不使用零、空串或当前日期兜底。
 */
export function normalizeValue(value: unknown, type: FieldType, fieldName: string): StandardValue {
  if (type === 'string') {
    if (typeof value === 'string') return value
    throw typeMismatch(fieldName, type)
  }
  if (type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && numberPattern.test(value)) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    throw typeMismatch(fieldName, type)
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    throw typeMismatch(fieldName, type)
  }

  if (typeof value !== 'string') throw typeMismatch(fieldName, type)
  const match = datePattern.exec(value)
  if (!match) throw typeMismatch(fieldName, type)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw typeMismatch(fieldName, type)
  }
  return value
}

export function normalizeRecord(
  source: Readonly<Record<string, unknown>>,
  mappings: RuntimeFieldMapping[],
): StandardRecord {
  const target: Record<string, StandardValue> = {}
  for (const mapping of mappings) {
    if (!Object.hasOwn(source, mapping.sourceField)) {
      throw new TaskExecutionError(
        'FIELD_MISSING',
        `来源字段缺失: ${mapping.sourceField}`,
        false,
      )
    }
    target[mapping.targetField] = normalizeValue(
      source[mapping.sourceField],
      mapping.targetType,
      mapping.targetField,
    )
  }
  return target
}

function typeMismatch(fieldName: string, type: FieldType) {
  return new TaskExecutionError(
    'FIELD_TYPE_MISMATCH',
    `字段 ${fieldName} 不符合 ${type} 类型`,
    false,
  )
}

type SourceOptions =
  | { fileType: 'csv'; encoding: 'utf-8' | 'utf-8-bom' | 'gb18030'; delimiter: ',' | '\t' | ';' }
  | { fileType: 'xlsx'; selectedSheet: string }

/**
 * 文件最多 10 MB；解析器逐记录产出对象，使标准化和脚本处理不再额外保存全部记录。
 */
export async function* readSourceRecords(
  content: ArrayBuffer,
  options: SourceOptions,
): AsyncGenerator<Readonly<Record<string, unknown>>> {
  if (options.fileType === 'csv') {
    const decoded = iconv.decode(
      new Uint8Array(content),
      options.encoding === 'utf-8-bom' ? 'utf-8' : options.encoding,
    )
    const text = options.encoding === 'utf-8-bom' ? decoded.replace(/^\uFEFF/, '') : decoded
    const parser = parse(text, { delimiter: options.delimiter, skip_empty_lines: true })
    let headers: string[] | undefined
    for await (const record of parser as unknown as AsyncIterable<string[]>) {
      if (!headers) {
        headers = record
        continue
      }
      if (record.length !== headers.length) {
        throw new TaskExecutionError('INCONSISTENT_COLUMNS', 'CSV 行列数与表头不一致', false)
      }
      yield Object.fromEntries(headers.map((header, index) => [header, record[index]]))
    }
    if (!headers) throw new TaskExecutionError('EMPTY_FILE', 'CSV 缺少表头', false)
    return
  }

  const workbook = XLSX.read(content, { dense: true })
  const worksheet = workbook.Sheets[options.selectedSheet]
  if (!worksheet) throw new TaskExecutionError('UNKNOWN_SHEET', '工作表不存在', false)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: true })
  const headerRow = rows[0]
  if (!headerRow) throw new TaskExecutionError('EMPTY_SHEET', '工作表缺少表头', false)
  const headers = headerRow.map(String)
  for (const row of rows.slice(1)) {
    if (row.length > headers.length) {
      throw new TaskExecutionError('INCONSISTENT_COLUMNS', '工作表行列数超过表头', false)
    }
    yield Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  }
}

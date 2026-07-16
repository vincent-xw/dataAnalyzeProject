import * as XLSX from 'xlsx'

import type { DatasetInspection } from '@data-analyze/contracts'

import { describeDuplicateHeaders, InspectionError } from './inspect-csv'

export type XlsxInspectionResult =
  | { status: 'awaiting_sheet'; sheets: string[] }
  | { status: 'inspected'; inspection: DatasetInspection }

/**
 * 只检查用户明确选择的工作表。先检查工作簿目录，再转换单张表，避免把所有工作表
 * 同时展开为 JavaScript 数组而放大内存占用。
 */
export function inspectXlsx(content: ArrayBuffer, selectedSheet?: string): XlsxInspectionResult {
  const workbook = XLSX.read(content, { dense: true })
  const sheets = workbook.SheetNames
  if (sheets.length === 0) {
    throw new InspectionError('EMPTY_WORKBOOK', 'Excel 文件不包含工作表')
  }
  if (!selectedSheet) {
    return { status: 'awaiting_sheet', sheets }
  }
  if (!sheets.includes(selectedSheet)) {
    throw new InspectionError('UNKNOWN_SHEET', '所选工作表不存在')
  }

  const worksheet = workbook.Sheets[selectedSheet]
  if (!worksheet) {
    throw new InspectionError('UNKNOWN_SHEET', '所选工作表不存在')
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  const header = rows[0]
  if (!header || header.length === 0) {
    throw new InspectionError('EMPTY_SHEET', '工作表至少需要一行表头')
  }
  if (header.length > 200) {
    throw new InspectionError('COLUMN_LIMIT_EXCEEDED', '工作表不能超过 200 列')
  }
  if (rows.length - 1 > 100_000) {
    throw new InspectionError('ROW_LIMIT_EXCEEDED', '工作表不能超过 10 万行')
  }

  const sourceFields = header.map((field) => String(field).trim())
  if (sourceFields.some((field) => field.length === 0)) {
    throw new InspectionError('INVALID_HEADER', '工作表表头不能为空')
  }
  if (new Set(sourceFields).size !== sourceFields.length) {
    throw new InspectionError('DUPLICATE_HEADER', `工作表表头不能重复：${describeDuplicateHeaders(sourceFields)}`)
  }

  // 检查每一行的逻辑列数，防止结构不规则的数据进入后续映射阶段。
  for (const row of rows.slice(1)) {
    if (row.length > header.length) {
      throw new InspectionError('INCONSISTENT_COLUMNS', '工作表数据行列数超过表头')
    }
  }

  return {
    status: 'inspected',
    inspection: {
      rowCount: rows.length - 1,
      columnCount: sourceFields.length,
      sheets,
      sourceFields,
    },
  }
}

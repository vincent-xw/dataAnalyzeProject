import type { FieldDefinition } from '@data-analyze/contracts'

import type { ReportConfig } from './index'

export type ReportValidationIssue =
  | { code: 'UNKNOWN_FIELD'; field: string }
  | { code: 'INVALID_LAYOUT'; widgetId: string }
  | { code: 'REPORT_DATA_SIZE_EXCEEDED' }
  | { code: 'CHART_POINT_LIMIT_EXCEEDED'; widgetId: string }
  | { code: 'TABLE_ROW_LIMIT_EXCEEDED'; widgetId: string }

type ReportStats = { rowCount: number; byteSize: number }

export function validateReportReferences(
  config: ReportConfig,
  schema: FieldDefinition[],
  stats: ReportStats,
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = []
  const knownFields = new Set(schema.map((field) => field.name))
  const checkedUnknownFields = new Set<string>()

  function checkField(field: string) {
    if (!knownFields.has(field) && !checkedUnknownFields.has(field)) {
      checkedUnknownFields.add(field)
      issues.push({ code: 'UNKNOWN_FIELD', field })
    }
  }

  for (const filter of config.filters) checkField(filter.field)
  for (const widget of config.widgets) {
    if (widget.layout.x + widget.layout.w > 12) {
      issues.push({ code: 'INVALID_LAYOUT', widgetId: widget.id })
    }
    if ('dimension' in widget) {
      checkField(widget.dimension)
      checkField(widget.metric)
      if (stats.rowCount > 5_000) {
        issues.push({ code: 'CHART_POINT_LIMIT_EXCEEDED', widgetId: widget.id })
      }
    } else if (widget.type === 'metric') {
      checkField(widget.metric)
    } else if (widget.type === 'table') {
      widget.columns.forEach(checkField)
      if (stats.rowCount > 10_000) {
        issues.push({ code: 'TABLE_ROW_LIMIT_EXCEEDED', widgetId: widget.id })
      }
    }
  }
  if (stats.byteSize > 5 * 1024 * 1024) {
    issues.push({ code: 'REPORT_DATA_SIZE_EXCEEDED' })
  }
  return issues
}

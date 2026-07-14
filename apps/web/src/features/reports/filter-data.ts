import type { ReportFilter } from '@data-analyze/report-schema'

export type ReportValue = string | number | boolean
export type ReportRow = Readonly<Record<string, ReportValue>>
export type FilterValue = ReportValue | ReportValue[] | [string, string] | undefined

export function filterReportData(
  data: ReportRow[],
  filter: ReportFilter,
  value: FilterValue,
): ReportRow[] {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return data

  if (filter.type === 'select') {
    return data.filter((row) => row[filter.field] === value)
  }
  if (filter.type === 'multi-select') {
    const selected = value as ReportValue[]
    return data.filter((row) => selected.includes(row[filter.field]!))
  }

  const [start, end] = value as [string, string]
  if (!start || !end) return data
  return data.filter((row) => {
    const fieldValue = row[filter.field]
    return typeof fieldValue === 'string' && fieldValue >= start && fieldValue <= end
  })
}

export function applyReportFilters(
  data: ReportRow[],
  filters: ReportFilter[],
  values: Record<string, FilterValue>,
) {
  return filters.reduce(
    (current, filter) => filterReportData(current, filter, values[filter.id]),
    data,
  )
}

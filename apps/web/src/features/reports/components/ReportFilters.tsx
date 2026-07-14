import type { ReportFilter } from '@data-analyze/report-schema'

import type { FilterValue, ReportRow, ReportValue } from '../filter-data'

type Props = {
  filters: ReportFilter[]
  data: ReportRow[]
  values: Record<string, FilterValue>
  onChange: (id: string, value: FilterValue) => void
}

export function ReportFilters({ filters, data, values, onChange }: Props) {
  return (
    <div className="report-filters">
      {filters.map((filter) => {
        if (filter.type === 'date-range') {
          const range = (values[filter.id] as [string, string] | undefined) ?? ['', '']
          return (
            <fieldset key={filter.id}>
              <legend>{filter.title}</legend>
              <input aria-label={`${filter.title}开始`} type="date" value={range[0]} onChange={(event) => onChange(filter.id, [event.target.value, range[1]])} />
              <input aria-label={`${filter.title}结束`} type="date" value={range[1]} onChange={(event) => onChange(filter.id, [range[0], event.target.value])} />
            </fieldset>
          )
        }

        const options = uniqueValues(data, filter.field)
        if (filter.type === 'multi-select') {
          const selected = (values[filter.id] as ReportValue[] | undefined) ?? []
          return (
            <label key={filter.id}>{filter.title}
              <select multiple value={selected.map(serializeValue)} onChange={(event) => onChange(filter.id, [...event.target.selectedOptions].map((option) => deserializeValue(option.value)))}>
                {options.map((option) => <option key={serializeValue(option)} value={serializeValue(option)}>{String(option)}</option>)}
              </select>
            </label>
          )
        }
        return (
          <label key={filter.id}>{filter.title}
            <select value={values[filter.id] === undefined ? '' : serializeValue(values[filter.id] as ReportValue)} onChange={(event) => onChange(filter.id, event.target.value === '' ? undefined : deserializeValue(event.target.value))}>
              <option value="">全部</option>
              {options.map((option) => <option key={serializeValue(option)} value={serializeValue(option)}>{String(option)}</option>)}
            </select>
          </label>
        )
      })}
    </div>
  )
}

function uniqueValues(data: ReportRow[], field: string) {
  return [...new Set(data.map((row) => row[field]).filter((value): value is ReportValue => value !== undefined))]
}

function serializeValue(value: ReportValue) {
  return JSON.stringify(value)
}

function deserializeValue(value: string): ReportValue {
  return JSON.parse(value) as ReportValue
}

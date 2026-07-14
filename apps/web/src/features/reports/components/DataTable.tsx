import { useMemo, useState } from 'react'

import type { TableWidget } from '@data-analyze/report-schema'

import type { ReportRow } from '../filter-data'

export function DataTable({ widget, data }: { widget: TableWidget; data: ReportRow[] }) {
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const sorted = useMemo(() => {
    if (!sort) return data
    return [...data].sort((left, right) => {
      const leftValue = left[sort.field]
      const rightValue = right[sort.field]
      let comparison = 0
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        comparison = leftValue - rightValue
      } else {
        comparison = String(leftValue).localeCompare(String(rightValue), 'zh-CN')
      }
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [data, sort])

  function toggleSort(field: string) {
    setSort((current) => ({
      field,
      direction: current?.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <article className="report-widget table-widget">
      <h3>{widget.title}</h3>
      {sorted.length === 0 ? <p>暂无数据</p> : (
        <div className="table-scroll">
          <table>
            <thead><tr>{widget.columns.map((column) => <th key={column}><button type="button" onClick={() => toggleSort(column)}>{column}</button></th>)}</tr></thead>
            <tbody>{sorted.map((row, index) => <tr key={index}>{widget.columns.map((column) => <td key={column}>{String(row[column])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </article>
  )
}

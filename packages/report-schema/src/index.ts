import { z } from 'zod'

export const LayoutSchema = z
  .object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(12),
  })
  .strict()

export const ChartWidgetSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['bar', 'line', 'pie']),
    title: z.string().min(1),
    dataset: z.literal('result'),
    dimension: z.string().min(1),
    metric: z.string().min(1),
    layout: LayoutSchema,
  })
  .strict()

export const MetricWidgetSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('metric'),
    title: z.string().min(1),
    dataset: z.literal('result'),
    metric: z.string().min(1),
    aggregation: z.enum(['sum', 'average', 'min', 'max', 'count']),
    format: z.enum(['number', 'percent', 'currency']),
    layout: LayoutSchema,
  })
  .strict()

export const TableWidgetSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('table'),
    title: z.string().min(1),
    dataset: z.literal('result'),
    columns: z.array(z.string().min(1)).min(1).max(30),
    layout: LayoutSchema,
  })
  .strict()

export const ReportWidgetSchema = z.union([
  ChartWidgetSchema,
  MetricWidgetSchema,
  TableWidgetSchema,
])

const FilterBaseSchema = {
  id: z.string().min(1),
  title: z.string().min(1),
  dataset: z.literal('result'),
  field: z.string().min(1),
}

export const SelectFilterSchema = z
  .object({ ...FilterBaseSchema, type: z.literal('select') })
  .strict()
export const MultiSelectFilterSchema = z
  .object({ ...FilterBaseSchema, type: z.literal('multi-select') })
  .strict()
export const DateRangeFilterSchema = z
  .object({ ...FilterBaseSchema, type: z.literal('date-range') })
  .strict()

export const ReportFilterSchema = z.discriminatedUnion('type', [
  SelectFilterSchema,
  MultiSelectFilterSchema,
  DateRangeFilterSchema,
])

export const ReportConfigSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    filters: z.array(ReportFilterSchema),
    widgets: z.array(ReportWidgetSchema).min(1),
  })
  .strict()
  .superRefine((config, context) => {
    // 组件与筛选器 ID 在各自命名空间内必须唯一，避免状态和联动目标歧义。
    for (const [kind, items] of [
      ['组件', config.widgets],
      ['筛选器', config.filters],
    ] as const) {
      const ids = new Set<string>()
      items.forEach((item, index) => {
        if (ids.has(item.id)) {
          context.addIssue({
            code: 'custom',
            message: `${kind} ID 重复: ${item.id}`,
            path: [kind === '组件' ? 'widgets' : 'filters', index, 'id'],
          })
        }
        ids.add(item.id)
      })
    }
  })

export type ReportConfig = z.infer<typeof ReportConfigSchema>
export type ReportWidget = z.infer<typeof ReportWidgetSchema>
export type ReportFilter = z.infer<typeof ReportFilterSchema>
export type ChartWidget = z.infer<typeof ChartWidgetSchema>
export type MetricWidget = z.infer<typeof MetricWidgetSchema>
export type TableWidget = z.infer<typeof TableWidgetSchema>

export * from './validate-fields'

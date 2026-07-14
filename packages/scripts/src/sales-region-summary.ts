import { ScriptMetadataSchema } from '@data-analyze/contracts'
import type { DataProcessor, StandardRecord } from '@data-analyze/script-sdk'
import { z } from 'zod'

const ParametersSchema = z
  .object({
    includeEmptyRegion: z.boolean(),
  })
  .strict()

const InputRecordSchema = z
  .object({
    region: z.string(),
    salesAmount: z.number().finite(),
    orderId: z.string().min(1),
  })
  .strict()

const OutputRecordSchema = z
  .object({
    region: z.string(),
    totalAmount: z.number().finite(),
    orderCount: z.number().int().positive(),
    averageAmount: z.number().finite(),
  })
  .strict()

type Parameters = z.infer<typeof ParametersSchema>

const metadata = ScriptMetadataSchema.parse({
  id: 'sales-region-summary',
  version: '1.0.0',
  name: '区域销售汇总',
  description: '按区域汇总销售额、订单数和平均订单金额',
  inputFields: [
    { name: 'region', type: 'string', description: '销售区域', required: true },
    { name: 'salesAmount', type: 'number', description: '销售金额', required: true },
    { name: 'orderId', type: 'string', description: '订单编号', required: true },
  ],
  outputFields: [
    { name: 'region', type: 'string', description: '销售区域', required: true },
    { name: 'totalAmount', type: 'number', description: '销售总额', required: true },
    { name: 'orderCount', type: 'number', description: '订单数', required: true },
    { name: 'averageAmount', type: 'number', description: '平均订单金额', required: true },
  ],
  parameterSchema: {
    type: 'object',
    properties: {
      includeEmptyRegion: {
        type: 'boolean',
        description: '是否允许保留空字符串区域；不会生成默认区域名称',
      },
    },
    required: ['includeEmptyRegion'],
    additionalProperties: false,
  },
})

export const salesRegionSummary: DataProcessor<Parameters> = {
  metadata,

  parseParameters(input) {
    return ParametersSchema.parse(input)
  },

  parseOutput(record) {
    return OutputRecordSchema.parse(record) as StandardRecord
  },

  async process(context) {
    const aggregates = new Map<string, { totalAmount: number; orderCount: number }>()

    for await (const rawRecord of context.input) {
      const record = InputRecordSchema.parse(rawRecord)
      if (record.region.length === 0 && !context.parameters.includeEmptyRegion) {
        throw new Error('EMPTY_REGION_NOT_ALLOWED')
      }

      // Map 保留来源区域的精确字符串，不合并相似名称，也不为空区域生成兜底名称。
      const current = aggregates.get(record.region) ?? { totalAmount: 0, orderCount: 0 }
      current.totalAmount += record.salesAmount
      current.orderCount += 1
      aggregates.set(record.region, current)
    }

    let totalAmount = 0
    let outputRows = 0
    for (const [region, aggregate] of aggregates) {
      const output = this.parseOutput({
        region,
        totalAmount: aggregate.totalAmount,
        orderCount: aggregate.orderCount,
        averageAmount: aggregate.totalAmount / aggregate.orderCount,
      })
      await context.output.write(output)
      totalAmount += aggregate.totalAmount
      outputRows += 1
    }

    context.logger.info('区域销售汇总完成', { outputRows })
    return {
      rowCount: outputRows,
      summary: {
        regionCount: outputRows,
        totalAmount,
      },
    }
  },
}

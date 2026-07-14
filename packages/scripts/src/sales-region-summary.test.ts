import { describe, expect, it } from 'vitest'

import type { DataProcessor, StandardRecord } from '@data-analyze/script-sdk'

import { salesRegionSummary } from './sales-region-summary'

async function runFixture(
  script: DataProcessor<{ includeEmptyRegion: boolean }>,
  input: StandardRecord[],
) {
  const output: StandardRecord[] = []
  const result = await script.process({
    taskId: 'fixture-task',
    scriptId: script.metadata.id,
    scriptVersion: script.metadata.version,
    parameters: { includeEmptyRegion: false },
    input: (async function* () {
      yield* input
    })(),
    output: { write: async (record) => void output.push(record) },
    logger: { info: () => undefined },
  })
  return { output, result }
}

describe('sales-region-summary', () => {
  it('按区域汇总销售额和订单数', async () => {
    const result = await runFixture(salesRegionSummary, [
      { region: '华东', salesAmount: 100, orderId: 'A' },
      { region: '华东', salesAmount: 50, orderId: 'B' },
    ])

    expect(result.output).toEqual([
      { region: '华东', totalAmount: 150, orderCount: 2, averageAmount: 75 },
    ])
  })

  it('参数拒绝缺失字段和额外字段', () => {
    expect(() => salesRegionSummary.parseParameters({})).toThrow()
    expect(() =>
      salesRegionSummary.parseParameters({ includeEmptyRegion: false, unknown: true }),
    ).toThrow()
  })

  it('默认策略下拒绝空区域而不生成默认名称', async () => {
    await expect(
      runFixture(salesRegionSummary, [{ region: '', salesAmount: 100, orderId: 'A' }]),
    ).rejects.toThrow('EMPTY_REGION_NOT_ALLOWED')
  })

  it('输出 Schema 拒绝多余字段', () => {
    expect(() =>
      salesRegionSummary.parseOutput({
        region: '华东',
        totalAmount: 100,
        orderCount: 1,
        averageAmount: 100,
        extra: true,
      }),
    ).toThrow()
  })
})

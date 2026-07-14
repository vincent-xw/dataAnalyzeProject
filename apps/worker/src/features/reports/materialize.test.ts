import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import type { StandardRecord } from '@data-analyze/script-sdk'

import { materializeReportData } from './materialize'

async function* createRows(count: number): AsyncGenerator<StandardRecord> {
  for (let index = 0; index < count; index += 1) yield { index }
}

describe('materializeReportData', () => {
  it('超过表格行上限时不写入 report data', async () => {
    const put = vi.spyOn(env.DATA_BUCKET, 'put')
    await expect(
      materializeReportData(createRows(10_001), env.DATA_BUCKET, 'report-1', 1),
    ).rejects.toMatchObject({ code: 'REPORT_TABLE_ROW_LIMIT_EXCEEDED', retryable: false })
    expect(put).not.toHaveBeenCalled()
    put.mockRestore()
  })

  it('超过 5 MB 时不写入 report data', async () => {
    const put = vi.spyOn(env.DATA_BUCKET, 'put')
    async function* largeRow(): AsyncGenerator<StandardRecord> {
      yield { content: 'x'.repeat(5 * 1024 * 1024) }
    }
    await expect(
      materializeReportData(largeRow(), env.DATA_BUCKET, 'report-2', 1),
    ).rejects.toMatchObject({ code: 'REPORT_DATA_SIZE_EXCEEDED' })
    expect(put).not.toHaveBeenCalled()
    put.mockRestore()
  })

  it('成功写入受限 JSON 数组并返回精确统计', async () => {
    const result = await materializeReportData(createRows(2), env.DATA_BUCKET, 'report-3', 1)
    expect(result).toMatchObject({ rowCount: 2, dataKey: 'data-analyze/reports/report-3/1/data.json' })
    expect(await (await env.DATA_BUCKET.get(result.dataKey))?.json()).toEqual([{ index: 0 }, { index: 1 }])
  })
})

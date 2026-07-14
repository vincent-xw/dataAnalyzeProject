import path from 'node:path'
import { expect, test } from '@playwright/test'

import { createAndPublishReport, createSalesTemplate, installAccessToken, mapField, requestAnalysis, uploadDataset } from './helpers'

test('创建模板到发布报表的主链路', async ({ page }) => {
  await installAccessToken(page)
  await createSalesTemplate(page)
  await uploadDataset(page, path.resolve('tests/e2e/fixtures/sales.csv'))
  await mapField(page, '区域', 'region')
  await mapField(page, '销售金额', 'salesAmount')
  await mapField(page, '订单编号', 'orderId')
  await page.getByRole('button', { name: '确认字段映射' }).click()
  await requestAnalysis(page, '按区域汇总销售额')
  await expect(page.getByText('sales-region-summary@1.0.0')).toBeVisible()
  await page.getByRole('button', { name: '确认并执行' }).click()
  await expect(page.getByText('执行成功')).toBeVisible({ timeout: 20_000 })
  await createAndPublishReport(page, '使用柱状图展示区域销售额')
  await expect(page.getByRole('heading', { name: '区域销售概览' })).toBeVisible()
})

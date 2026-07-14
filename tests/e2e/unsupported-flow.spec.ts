import path from 'node:path'
import { expect, test } from '@playwright/test'

import { createSalesTemplate, installAccessToken, mapField, requestAnalysis, uploadDataset } from './helpers'

test.beforeEach(async ({ page }) => {
  await installAccessToken(page)
  await createSalesTemplate(page)
  await uploadDataset(page, path.resolve('tests/e2e/fixtures/sales.csv'))
})

test('必填字段未全部映射时不能进入推荐阶段', async ({ page }) => {
  await mapField(page, '区域', 'region')
  await expect(page.getByRole('button', { name: '确认字段映射' })).toBeDisabled()
  await expect(page.getByText(/未映射必填字段/)).toBeVisible()
})

test('模型明确拒绝时不显示执行按钮', async ({ page }) => {
  await mapField(page, '区域', 'region')
  await mapField(page, '销售金额', 'salesAmount')
  await mapField(page, '订单编号', 'orderId')
  await page.getByRole('button', { name: '确认字段映射' }).click()
  await requestAnalysis(page, '不支持：预测下一季度天气')
  await expect(page.getByRole('heading', { name: '当前需求不受支持' })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认并执行' })).toHaveCount(0)
})

import { expect, type Page } from '@playwright/test'

import { createTestAccessToken } from './test-access-token'

/** 给同源代理的 API 请求添加真实签名 Access JWT。 */
export async function installAccessToken(page: Page) {
  const token = await createTestAccessToken()
  await page.route('**/{api,internal}/**', async (route) => {
    await route.continue({ headers: { ...route.request().headers(), 'cf-access-jwt-assertion': token } })
  })
}

export async function createSalesTemplate(page: Page) {
  await page.goto('/templates/new')
  await page.getByLabel('名称', { exact: true }).fill('销售分析模板')
  await page.getByLabel('描述', { exact: true }).fill('区域销售数据分析')
  const fields = [
    ['region', '销售区域', '文本'],
    ['salesAmount', '销售金额', '数字'],
    ['orderId', '订单编号', '文本'],
  ] as const
  for (let index = 1; index < fields.length; index += 1) await page.getByRole('button', { name: '添加字段' }).click()
  for (const [index, [name, description, type]] of fields.entries()) {
    await page.getByLabel(`字段 ${index + 1} 名称`).fill(name)
    await page.getByLabel(`字段 ${index + 1} 类型`).selectOption({ label: type })
    await page.getByLabel(`字段 ${index + 1} 描述`).fill(description)
    await page.getByRole('checkbox').nth(index).check()
  }
  await page.getByLabel('数据加工预设 Prompt').fill('只选择能完整处理全部标准字段的固定脚本')
  await page.getByLabel('报表预设 Prompt').fill('只使用系统固定报表组件展示结果')
  await page.getByRole('button', { name: '创建模板' }).click()
  await expect(page.getByRole('heading', { name: '销售分析模板' }).last()).toBeVisible()
}

export async function uploadDataset(page: Page, path: string) {
  await page.goto('/datasets/new')
  await page.getByLabel('分析模板').selectOption({ label: '销售分析模板' })
  await page.getByLabel('CSV 或 XLSX 文件').setInputFiles(path)
  await page.getByLabel('CSV 编码').selectOption('utf-8')
  await page.getByLabel('CSV 分隔符').selectOption(',')
  await page.getByRole('button', { name: '上传并检查' }).click()
  await expect(page.getByRole('heading', { name: /确认字段映射/ })).toBeVisible()
}

export async function mapField(page: Page, source: string, target: string) {
  await page.getByLabel(`${source} 对应标准字段`).selectOption(target)
}

export async function requestAnalysis(page: Page, requirement: string) {
  await page.getByLabel('本次客制化加工需求').fill(requirement)
  await page.getByRole('button', { name: '获取脚本推荐' }).click()
}

export async function createAndPublishReport(page: Page, requirement: string) {
  await page.getByRole('link', { name: '创建报表' }).click()
  await page.getByLabel('本次展示需求').fill(requirement)
  await page.getByRole('button', { name: '生成预览' }).click()
  await expect(page.getByRole('heading', { name: '区域销售概览' })).toBeVisible()
  await page.getByRole('button', { name: '确认发布' }).click()
}

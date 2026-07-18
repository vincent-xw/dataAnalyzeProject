import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { authenticatedRequest } from '../../testing/request'
import { LlmClientError } from '../llm/client'
import { toTemplateLlmErrorResponse } from './routes'

const validTemplateRequest = {
  name: '销售分析',
  description: '销售数据模板',
  fields: [
    { name: 'salesAmount', type: 'number', sourceLabel: '销售额', required: true },
    { name: 'region', type: 'string', sourceLabel: '销售区域', required: true },
  ],
  processingPrompt: '选择能够完成销售分析的完整脚本',
  reportingPrompt: '使用固定组件展示销售结果',
}

async function createTemplate() {
  return authenticatedRequest(
    '/api/templates',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validTemplateRequest),
    },
    env,
  )
}

describe('分析模板 API', () => {
  beforeEach(async () => {
    // Cloudflare 测试池会在同一测试文件内复用 D1，逐用例清理可避免数据相互污染。
    await env.DB.batch([
      env.DB.prepare('DELETE FROM data_assets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
    ])
  })

  it('创建模板时同时写入两个 Prompt v1', async () => {
    const response = await createTemplate()

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      name: '销售分析',
      processingPromptVersion: 1,
      reportingPromptVersion: 1,
    })
  })

  it('拒绝重复标准字段名', async () => {
    const response = await authenticatedRequest(
      '/api/templates',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...validTemplateRequest,
          fields: [validTemplateRequest.fields[0], validTemplateRequest.fields[0]],
        }),
      },
      env,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('创建新 Prompt 版本并更新模板当前版本', async () => {
    const created = (await (await createTemplate()).json()) as { id: string }
    const promptResponse = await authenticatedRequest(
      `/api/templates/${created.id}/prompts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'processing', content: '更新后的加工约束' }),
      },
      env,
    )

    expect(promptResponse.status).toBe(201)
    expect(await promptResponse.json()).toMatchObject({ type: 'processing', version: 2 })

    const detail = await authenticatedRequest(`/api/templates/${created.id}`, {}, env)
    expect(await detail.json()).toMatchObject({
      processingPrompt: { version: 2, content: '更新后的加工约束' },
      reportingPrompt: { version: 1 },
    })
  })

  it('返回模板列表', async () => {
    await createTemplate()

    const response = await authenticatedRequest('/api/templates', {}, env)

    expect(response.status).toBe(200)
    expect((await response.json()) as unknown[]).toHaveLength(1)
  })

  it('从 CSV 表头生成标准字段草稿', async () => {
    const content = 'order_id,customer_name,amount\nA001,zhangsan,10\n'
    const inspectResponse = await authenticatedRequest('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'content-length': String(new TextEncoder().encode(content).byteLength),
        'x-file-name': 'orders.csv',
        'x-csv-encoding': 'utf-8',
        'x-csv-delimiter': ',',
      },
      body: content,
    }, env)

    const inspectionPayload = await inspectResponse.json()
    expect(inspectResponse.status, JSON.stringify(inspectionPayload)).toBe(200)
    const inspection = (inspectionPayload as { inspection: unknown }).inspection
    expect(inspection).toMatchObject({ rowCount: 1, columnCount: 3, sourceFields: ['order_id', 'customer_name', 'amount'] })
  })

  it('浏览器未传 Content-Length 时仍检查 CSV 表头', async () => {
    const content = 'order_id\nA001\n'
    const response = await authenticatedRequest('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'x-file-name': 'orders.csv',
        'x-csv-encoding': 'utf-8',
        'x-csv-delimiter': ',',
      },
      body: content,
    }, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'inspected',
      inspection: { sourceFields: ['order_id'] },
    })
  })

  it('解码中文文件名后检查 CSV 表头', async () => {
    const content = 'order_id\nA001\n'
    const response = await authenticatedRequest('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'x-file-name': encodeURIComponent('销售数据.csv'),
        'x-csv-encoding': 'utf-8',
        'x-csv-delimiter': ',',
      },
      body: content,
    }, env)

    expect(response.status).toBe(200)
  })

  it('单工作表 XLSX 未指定工作表时直接检查表头', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['订单号'], ['A001']]), '数据')
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const response = await authenticatedRequest('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'x-file-name': encodeURIComponent('数据.xlsx'),
      },
      body: content,
    }, env)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'inspected',
      inspection: { sourceFields: ['订单号'], sheets: ['数据'] },
    })
  })

  it('重复工作表表头返回具体列名和列序号', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['金额', '金额 '], [1, 2]]), '数据')
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const response = await authenticatedRequest('/api/templates/inspect-source', {
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'x-file-name': encodeURIComponent('重复表头.xlsx'),
        'x-selected-sheet': encodeURIComponent('数据'),
      },
      body: content,
    }, env)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'DUPLICATE_HEADER',
      message: '工作表表头不能重复：“金额”（第 1、2 列）',
    })
  })

  it('LLM 字段生成失败时返回可识别的上游错误', async () => {
    expect(toTemplateLlmErrorResponse(new LlmClientError('LLM_REQUEST_FAILED', 'LLM HTTP 状态异常: 400'))).toEqual({
      status: 502,
      body: {
      code: 'LLM_REQUEST_FAILED',
      message: 'LLM HTTP 状态异常: 400',
      },
    })
  })
})

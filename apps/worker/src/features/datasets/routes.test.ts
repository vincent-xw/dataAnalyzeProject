import { env } from 'cloudflare:test'
import * as XLSX from 'xlsx'
import { beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../index'

const MAX_FILE_SIZE = 10 * 1024 * 1024

async function createTemplate() {
  const response = await app.request(
    '/api/templates',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '数据导入模板',
        description: '用于验证文件接入',
        fields: [{ name: 'salesAmount', type: 'number', description: '销售额', required: true }],
        processingPrompt: '加工数据',
        reportingPrompt: '展示数据',
      }),
    },
    env,
  )
  return (await response.json()) as { id: string }
}

async function uploadDataset(options: {
  content: BodyInit
  contentLength: number
  contentType: string
  fileName: string
  templateId: string
}) {
  return app.request(
    '/api/datasets',
    {
      method: 'POST',
      headers: {
        'content-length': String(options.contentLength),
        'content-type': options.contentType,
        'x-file-name': options.fileName,
        'x-template-id': options.templateId,
      },
      body: options.content,
    },
    env,
  )
}

describe('数据集上传和结构检查 API', () => {
  beforeEach(async () => {
    // 按外键依赖的逆序清理控制面数据，保证每个用例拥有独立状态。
    await env.DB.batch([
      env.DB.prepare('DELETE FROM field_mappings'),
      env.DB.prepare('DELETE FROM dataset_versions'),
      env.DB.prepare('DELETE FROM datasets'),
      env.DB.prepare('DELETE FROM prompt_versions'),
      env.DB.prepare('DELETE FROM analysis_templates'),
    ])
  })

  it('拒绝超过 10 MB 的文件', async () => {
    const template = await createTemplate()
    const response = await uploadDataset({
      content: 'x',
      contentLength: MAX_FILE_SIZE + 1,
      contentType: 'text/csv',
      fileName: 'too-large.csv',
      templateId: template.id,
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('拒绝未知文件类型', async () => {
    const template = await createTemplate()
    const response = await uploadDataset({
      content: '{}',
      contentLength: 2,
      contentType: 'application/json',
      fileName: 'unknown.json',
      templateId: template.id,
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' })
  })

  it('上传并检查 UTF-8 CSV', async () => {
    const template = await createTemplate()
    const content = '销售额,区域\n100,华东\n200,华南\n'
    const upload = await uploadDataset({
      content,
      contentLength: new TextEncoder().encode(content).byteLength,
      contentType: 'text/csv',
      fileName: 'sales.csv',
      templateId: template.id,
    })
    const uploaded = (await upload.json()) as { id: string; versionId: string }

    expect(upload.status).toBe(201)

    const inspect = await app.request(
      `/api/datasets/${uploaded.versionId}/inspect`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encoding: 'utf-8', delimiter: ',' }),
      },
      env,
    )

    expect(inspect.status).toBe(200)
    expect(await inspect.json()).toMatchObject({
      status: 'inspected',
      inspection: { rowCount: 2, columnCount: 2, sourceFields: ['销售额', '区域'] },
    })
  })

  it('CSV 超过 200 列时停止检查', async () => {
    const template = await createTemplate()
    const content = `${Array.from({ length: 201 }, (_, index) => `列${index}`).join(',')}\n`
    const upload = await uploadDataset({
      content,
      contentLength: new TextEncoder().encode(content).byteLength,
      contentType: 'text/csv',
      fileName: 'wide.csv',
      templateId: template.id,
    })
    const uploaded = (await upload.json()) as { versionId: string }

    const inspect = await app.request(
      `/api/datasets/${uploaded.versionId}/inspect`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encoding: 'utf-8', delimiter: ',' }),
      },
      env,
    )

    expect(inspect.status).toBe(422)
    expect(await inspect.json()).toMatchObject({ code: 'COLUMN_LIMIT_EXCEEDED' })
  })

  it('CSV 超过 10 万行时停止检查', async () => {
    const template = await createTemplate()
    const content = `值\n${'1\n'.repeat(100_001)}`
    const upload = await uploadDataset({
      content,
      contentLength: new TextEncoder().encode(content).byteLength,
      contentType: 'text/csv',
      fileName: 'long.csv',
      templateId: template.id,
    })
    const uploaded = (await upload.json()) as { versionId: string }

    const inspect = await app.request(
      `/api/datasets/${uploaded.versionId}/inspect`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encoding: 'utf-8', delimiter: ',' }),
      },
      env,
    )

    expect(inspect.status).toBe(422)
    expect(await inspect.json()).toMatchObject({ code: 'ROW_LIMIT_EXCEEDED' })
  })

  it('Excel 多工作表要求显式选择后才完成检查', async () => {
    const template = await createTemplate()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['销售额'], [100]]), '一月')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['销售额'], [200]]), '二月')
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const upload = await uploadDataset({
      content,
      contentLength: content.byteLength,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'sales.xlsx',
      templateId: template.id,
    })
    const uploaded = (await upload.json()) as { versionId: string }

    const pending = await app.request(
      `/api/datasets/${uploaded.versionId}/inspect`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      env,
    )
    expect(await pending.json()).toMatchObject({ status: 'awaiting_sheet', sheets: ['一月', '二月'] })

    const selected = await app.request(
      `/api/datasets/${uploaded.versionId}/inspect`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedSheet: '二月' }),
      },
      env,
    )
    expect(selected.status).toBe(200)
    expect(await selected.json()).toMatchObject({
      status: 'inspected',
      inspection: { rowCount: 1, columnCount: 1, sourceFields: ['销售额'] },
    })
  })
})

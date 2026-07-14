import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../index'

const validTemplateRequest = {
  name: '销售分析',
  description: '销售数据模板',
  fields: [
    { name: 'salesAmount', type: 'number', description: '销售额', required: true },
    { name: 'region', type: 'string', description: '销售区域', required: true },
  ],
  processingPrompt: '选择能够完成销售分析的完整脚本',
  reportingPrompt: '使用固定组件展示销售结果',
}

async function createTemplate() {
  return app.request(
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
    const response = await app.request(
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
    const promptResponse = await app.request(
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

    const detail = await app.request(`/api/templates/${created.id}`, {}, env)
    expect(await detail.json()).toMatchObject({
      processingPrompt: { version: 2, content: '更新后的加工约束' },
      reportingPrompt: { version: 1 },
    })
  })

  it('返回模板列表', async () => {
    await createTemplate()

    const response = await app.request('/api/templates', {}, env)

    expect(response.status).toBe(200)
    expect((await response.json()) as unknown[]).toHaveLength(1)
  })
})

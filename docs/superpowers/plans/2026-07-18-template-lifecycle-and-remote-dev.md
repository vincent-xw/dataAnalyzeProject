# 模板生命周期与远端开发资源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现模板预览、编辑和安全删除，并让本机 Worker 使用 Cloudflare 远端开发资源。

**Architecture:** Worker 服务层承载更新和删除事务，编辑仅新增 Prompt 版本并更新当前指针。前端新增详情页、复用模板表单完成编辑。`dev:worker` 仅启动 `wrangler dev --remote`；E2E 保留独立本地启动脚本。

**Tech Stack:** React 19、React Router、Testing Library、Hono、D1、Vitest、Wrangler 4、TypeScript。

## Global Constraints

- 删除仅允许未被 `datasets`、`field_mappings` 或 `data_assets` 引用的模板。
- 模板编辑必须为两个 Prompt 都创建新版本，历史版本不可修改。
- Worker 进程本机运行，D1、R2、Queue 均连接 Cloudflare 远端开发资源。
- `scripts/start-e2e-worker.ts` 不作改动，测试仍使用本地资源。

---

### Task 1: 模板更新和安全删除 API

**Files:**
- Modify: `apps/worker/src/features/templates/service.ts`
- Modify: `apps/worker/src/features/templates/routes.ts`
- Test: `apps/worker/src/features/templates/routes.test.ts`

**Interfaces:**
- Produces: `update(id: string, input: CreateTemplateInput)` 与 `remove(id: string)` 服务方法；`PUT` 和 `DELETE /api/templates/:id`。

- [ ] **Step 1: 写更新 API 的失败测试**

在模板路由测试中先创建模板，再调用 PUT，断言名称、字段和两个 Prompt 内容更新，两个版本均从 1 增至 2：

```ts
expect(response.status).toBe(200)
expect(await response.json()).toMatchObject({
  name: '更新后的销售分析',
  processingPrompt: { version: 2, content: '新版加工 Prompt' },
  reportingPrompt: { version: 2, content: '新版报表 Prompt' },
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: 新测试因缺少 PUT 路由失败。

- [ ] **Step 3: 最小实现更新事务**

在 `TemplateService.update` 中读取模板和当前 Prompt，创建两个 UUID，用 D1 batch 插入 `version + 1` 的 processing/reporting Prompt，并更新模板的名称、描述、Schema、两个当前 Prompt ID 和更新时间。路由以现有 `CreateTemplateRequestSchema` 验证请求；服务返回 null 时产生 404。

```ts
templateRoutes.put('/:id', async (context) => {
  const request = CreateTemplateRequestSchema.safeParse(await context.req.json().catch(() => null))
  if (!request.success) return context.json({ code: 'INVALID_REQUEST', message: '请求参数不符合模板协议', details: request.error.issues }, 400)
  const template = await new TemplateService(context.env.DB).update(context.req.param('id'), request.data)
  return template ? context.json(template) : context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
})
```

- [ ] **Step 4: 运行更新测试确认通过**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: PASS。

- [ ] **Step 5: 写删除 API 的失败测试**

增加三个用例：无引用模板 DELETE 返回 204 且 GET 返回 404；不存在 ID 返回 404；插入 `datasets` 引用后 DELETE 返回 409 和 `TEMPLATE_IN_USE`。

```ts
expect(response.status).toBe(409)
expect(await response.json()).toMatchObject({ code: 'TEMPLATE_IN_USE' })
```

- [ ] **Step 6: 运行删除测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: 新测试因缺少 DELETE 路由失败。

- [ ] **Step 7: 最小实现安全删除**

`remove` 对 `datasets`、`field_mappings`、`data_assets` 做存在性查询。任何一项存在即返回 `in_use`；否则 batch 先删除 `prompt_versions` 再删除模板，以受影响行数区分 `deleted` 与 `not_found`。路由映射为 204、404 和 409。

```ts
if (result === 'in_use') return context.json({ code: 'TEMPLATE_IN_USE', message: '模板已被数据集、字段映射或数据资产引用，不能删除' }, 409)
if (result === 'not_found') return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
return context.body(null, 204)
```

- [ ] **Step 8: 运行 Worker 测试并提交**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: PASS。

```bash
git add apps/worker/src/features/templates/service.ts apps/worker/src/features/templates/routes.ts apps/worker/src/features/templates/routes.test.ts
git commit -m "feat(worker): manage analysis templates"
```

### Task 2: 模板预览、编辑和删除界面

**Files:**
- Modify: `apps/web/src/features/templates/TemplateListPage.tsx`
- Modify: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/web/src/features/templates/TemplatePreviewPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Test: `apps/web/src/features/templates/TemplateListPage.test.tsx`
- Test: `apps/web/src/features/templates/TemplatePreviewPage.test.tsx`
- Test: `apps/web/src/features/templates/TemplateEditorPage.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT/DELETE /api/templates/:id` 和 `apiRequest`。
- Produces: 详情路由 `/templates/:templateId`、编辑路由 `/templates/:templateId/edit` 与列表操作。

- [ ] **Step 1: 写列表操作和预览的失败测试**

Mock 列表和详情 API，断言列表有预览、编辑、删除，预览展示标准字段和两个 Prompt：

```tsx
expect(screen.getByRole('link', { name: '预览' })).toHaveAttribute('href', '/templates/template-1')
expect(screen.getByRole('link', { name: '编辑' })).toHaveAttribute('href', '/templates/template-1/edit')
expect(screen.getByText('新版加工 Prompt')).toBeVisible()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates/TemplateListPage.test.tsx src/features/templates/TemplatePreviewPage.test.tsx`

Expected: FAIL，因为尚未提供操作和预览组件。

- [ ] **Step 3: 实现列表、预览和路由**

列表的删除操作先调用 `window.confirm`，成功后用 state 过滤项，失败时显示 API 的 message。预览页加载详情，展示名称、描述、字段表和两个当前 Prompt。新增路由必须排在参数详情路由前：

```tsx
{ path: 'templates/new', element: <TemplateEditorPage /> },
{ path: 'templates/:templateId/edit', element: <TemplateEditorPage /> },
{ path: 'templates/:templateId', element: <TemplatePreviewPage /> },
```

- [ ] **Step 4: 运行列表和预览测试确认通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates/TemplateListPage.test.tsx src/features/templates/TemplatePreviewPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 写编辑加载和 PUT 保存的失败测试**

使用带 `/templates/template-1/edit` 初始地址的 Router，mock GET 详情与 PUT；断言名称预填和提交目标：

```tsx
expect(screen.getByLabelText('名称')).toHaveValue('销售分析')
await user.click(screen.getByRole('button', { name: '保存模板' }))
expect(fetcher).toHaveBeenCalledWith('/api/templates/template-1', expect.objectContaining({ method: 'PUT' }))
```

- [ ] **Step 6: 运行编辑测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates/TemplateEditorPage.test.tsx`

Expected: 新测试因编辑器不加载路径参数且只发送 POST 而失败。

- [ ] **Step 7: 让编辑器支持编辑模式**

`TemplateEditorPage` 从 `useParams` 读取 `templateId`。有 ID 时 effect 加载详情并填充表单，提交改为 PUT；无 ID 时保持创建 POST。编辑标题为“编辑分析模板”，按钮为“保存模板”，保存后转到详情页，加载和保存失败沿用 toast。

- [ ] **Step 8: 运行模板前端测试并提交**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates`

Expected: PASS。

```bash
git add apps/web/src/features/templates apps/web/src/router.tsx
git commit -m "feat(web): manage analysis templates"
```

### Task 3: 远端开发资源启动脚本

**Files:**
- Modify: `scripts/start-dev-worker.ts`
- Create: `scripts/start-dev-worker.test.ts`

**Interfaces:**
- Produces: `pnpm dev:worker` 以 `wrangler dev --remote --port 8787 --var ENVIRONMENT:development` 启动。

- [ ] **Step 1: 写脚本的失败测试**

Mock `node:child_process`；导入脚本后断言不调用 `spawnSync`，且启动参数包含 `--remote`、不含 `--local` 和 `--persist-to`：

```ts
expect(spawnSync).not.toHaveBeenCalled()
expect(spawn).toHaveBeenCalledWith('pnpm', expect.arrayContaining(['dev', '--remote', '--port', '8787']), expect.anything())
expect((spawn.mock.calls[0][1] as string[])).not.toContain('--local')
```

- [ ] **Step 2: 运行脚本测试确认失败**

Run: `pnpm exec vitest run scripts/start-dev-worker.test.ts`

Expected: FAIL，因为当前脚本会迁移本地 D1 并传入 `--local`。

- [ ] **Step 3: 最小实现远端启动**

删除 `spawnSync`、脚本注册表导入和本地 D1 迁移/初始化。Worker 启动参数改为：

```ts
const worker = spawn('pnpm', [...workerFilter, 'dev', '--remote', '--port', '8787', '--var', 'ENVIRONMENT:development'], { stdio: 'inherit' })
```

- [ ] **Step 4: 运行脚本测试并提交**

Run: `pnpm exec vitest run scripts/start-dev-worker.test.ts`

Expected: PASS。

```bash
git add scripts/start-dev-worker.ts scripts/start-dev-worker.test.ts
git commit -m "chore(dev): use remote cloudflare resources"
```

### Task 4: 整体验证

**Files:**
- Verify only.

- [ ] **Step 1: 执行静态检查、完整测试与构建**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: 每项退出码均为 0。

- [ ] **Step 2: 人工验证远端开发启动**

Run: `pnpm dev:worker`

Expected: Wrangler 在本地端口监听并使用远端 mode，且输出中不包含本地 D1 Migration。该步骤需要有效 Cloudflare 登录凭据和预先绑定的开发资源。

- [ ] **Step 3: 执行端到端测试**

Run: `pnpm test:e2e`

Expected: PASS，使用本地 E2E Worker。

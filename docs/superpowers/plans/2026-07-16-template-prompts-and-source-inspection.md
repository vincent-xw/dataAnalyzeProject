# 模板 Prompt 与表头检查修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为新建模板提供可放大编辑的默认 Prompt，并修复浏览器上传文件后无法检查表头的问题。

**Architecture:** 表头检查接口改为以实际请求体大小校验文件，不再依赖浏览器禁止设置的 `Content-Length`。前端抽出无业务依赖的 Prompt 弹窗编辑组件；模板页以预设文本初始化，并只在弹窗保存时更新表单值。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Hono、Cloudflare Workers。

## Global Constraints

- 标准字段检查和 LLM 生成只发送表头及规模，不发送数据行。
- 保持现有 Prompt 版本接口和模板创建协议不变。
- 复杂业务逻辑添加中文注释；不增加字段兜底。

---

### Task 1: 修复浏览器表头检查请求

**Files:**
- Modify: `apps/worker/src/features/datasets/upload.ts`
- Modify: `apps/worker/src/features/templates/routes.ts`
- Modify: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Test: `apps/worker/src/features/templates/routes.test.ts`

**Interfaces:**
- Consumes: `POST /api/templates/inspect-source` 的原始 CSV/XLSX 请求体。
- Produces: 不依赖 `Content-Length` 的 `SourceInspectionMetadata`，仍返回既有检查结果。

- [ ] **Step 1: 写入失败测试**

```ts
it('未传 Content-Length 时仍检查 CSV 表头', async () => {
  const response = await authenticatedRequest('/api/templates/inspect-source', {
    method: 'POST',
    headers: { 'content-type': 'text/csv', 'x-file-name': 'orders.csv' },
    body: 'order_id\\nA001\\n',
  }, env)
  expect(response.status).toBe(200)
})
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: 因缺少 `Content-Length` 返回 400。

- [ ] **Step 3: 实现最小修复**

```ts
export function parseSourceInspectionMetadata(headers: Headers): SourceInspectionMetadata {
  // 仅校验文件名和 MIME；请求体大小在 route 读取 ArrayBuffer 后校验。
}
```

在路由中读取 `ArrayBuffer` 后，以 `content.byteLength` 检查 10 MB 上限；前端删除 `content-length` 请求头。

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: 所有模板接口测试通过。

### Task 2: 添加默认 Prompt 与放大编辑器

**Files:**
- Create: `apps/web/src/features/templates/PromptEditorDialog.tsx`
- Create: `apps/web/src/features/templates/PromptEditorDialog.test.tsx`
- Modify: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `{ title: string; value: string; onSave(value: string): void; onClose(): void }`。
- Produces: 可编辑的模态 Prompt 对话框；模板页保存最终文本到既有 `processingPrompt` 和 `reportingPrompt` 状态。

- [ ] **Step 1: 写入失败测试**

```tsx
it('保存放大编辑内容后回写模板字段', async () => {
  render(<TemplateEditorPage />)
  await userEvent.click(screen.getByRole('button', { name: '放大编辑数据加工预设 Prompt' }))
  await userEvent.clear(screen.getByLabelText('数据加工预设 Prompt 完整内容'))
  await userEvent.type(screen.getByLabelText('数据加工预设 Prompt 完整内容'), '自定义约束')
  await userEvent.click(screen.getByRole('button', { name: '保存 Prompt' }))
  expect(screen.getByText('自定义约束')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates/PromptEditorDialog.test.tsx`

Expected: 因组件和按钮不存在而失败。

- [ ] **Step 3: 实现最小组件与预设**

```tsx
<PromptEditorDialog
  title="数据加工预设 Prompt"
  value={processingPrompt}
  onSave={setProcessingPrompt}
  onClose={() => setEditingPrompt(null)}
/>
```

在模板页定义受控加工与报表默认 Prompt。弹窗使用页面遮罩、宽屏内容区和较高的文本编辑区；取消不回写状态。

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/templates/PromptEditorDialog.test.tsx`

Expected: 弹窗打开、保存和取消行为通过。

### Task 3: 全量验证

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: 更新架构文档**

说明模板创建时的 Prompt 默认值、放大编辑器及表头检查不再依赖前端 `Content-Length`。

- [ ] **Step 2: 运行验证命令**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 全部通过；构建仅保留现有前端体积警告。

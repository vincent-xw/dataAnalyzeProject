# 数据资产平台实施路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前“上传后选择业务脚本”的流程迁移为“数据资产沉淀、预览、报表和受控派生加工”的单用户数据平台。

**Architecture:** 保留现有 R2、D1、Queue、文件检查、字段映射和严格标准化能力。映射后的 baseline 结果登记为原始数据资产；报表绑定资产；派生加工使用 R2 中不可变 `plan.json` 和 Worker 内置 DSL 解释器。普通用户不接触脚本、PR 或 CI。

**Tech Stack:** React 19、Vite、Hono、Cloudflare Workers、D1、R2、Queue、Zod、Vitest、Testing Library、Playwright。

## Global Constraints

- LLM 默认不接收真实数据行；仅在用户明确授权后接收当前预览前 5 行样例，且不写日志或持久化。
- 元数据默认只包括名称、描述和标签，不作为计算字段。
- 任何数据加工只能执行受控 DSL，禁止 R2 动态源码执行。
- 资产、计划和报表历史不可静默覆盖；失败不改变父资产。
- 所有非直观业务逻辑添加中文注释；不得为字段增加未说明的兜底值。

---

## 阶段一：数据资产中心与预览

### Task 1: 建立数据资产控制面与原始资产登记

**Files:**
- Create: `apps/worker/migrations/0005_data_assets.sql`
- Create: `apps/worker/src/features/assets/service.ts`
- Create: `apps/worker/src/features/assets/routes.ts`
- Modify: `apps/worker/src/features/datasets/routes.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/src/features/assets/routes.test.ts`

**Interfaces:**
- Consumes: baseline 任务的 `result_object_key`、`result_schema_object_key`、当前映射和数据集版本。
- Produces: `DataAsset`，其 `kind` 为 `source`，状态为 `ready`，并包含 R2 数据/Schema 指针。

- [ ] **Step 1: 写失败测试**

```ts
expect(await response.json()).toMatchObject({
  kind: 'source',
  name: '三年二班期中成绩',
  rowCount: 42,
  status: 'ready',
})
```

- [ ] **Step 2: 运行测试，确认资产接口不存在**

Run: `pnpm --filter @data-analyze/worker test -- src/features/assets/routes.test.ts`

- [ ] **Step 3: 实现 Migration 与资产服务**

```sql
CREATE TABLE data_assets (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source', 'derived')),
  template_id text NOT NULL,
  name text NOT NULL,
  description text,
  tags_json text NOT NULL,
  data_object_key text NOT NULL,
  schema_object_key text NOT NULL,
  preview_object_key text,
  row_count integer NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'processing', 'failed')),
  created_by text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
```

在 baseline 任务成功后创建 `source` 资产；名字取上传文件名去扩展名，描述为 `NULL`，标签为 `[]`。不创建业务字段兜底。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/assets/routes.test.ts`

### Task 2: 元数据建议、编辑、资产列表与预览 API

**Files:**
- Modify: `apps/worker/src/features/assets/service.ts`
- Modify: `apps/worker/src/features/assets/routes.ts`
- Modify: `apps/worker/src/features/llm/client.ts`
- Test: `apps/worker/src/features/assets/routes.test.ts`
- Test: `apps/worker/src/features/llm/client.test.ts`

**Interfaces:**
- Consumes: 资产名称、模板名、行数和用户说明。
- Produces: 用户确认的 `name`、`description`、`tags`；`GET /api/assets/{id}/preview` 固定返回前 50 行。

- [ ] **Step 1: 写失败测试**

```ts
expect(await suggestion.json()).toEqual({
  name: '三年二班期中成绩',
  description: '王老师负责的三年二班期中成绩。',
  tags: ['王老师', '三年二班', '期中考试'],
})
expect(await preview.json()).toMatchObject({ rowCount: 42, rows: [expect.any(Object)] })
```

- [ ] **Step 2: 运行测试，确认建议和预览路由不存在**

Run: `pnpm --filter @data-analyze/worker test -- src/features/assets/routes.test.ts`

- [ ] **Step 3: 实现受控协议与 API**

```text
POST /api/assets/{id}/metadata-suggestions
PUT  /api/assets/{id}/metadata
GET  /api/assets
GET  /api/assets/{id}
GET  /api/assets/{id}/preview
```

元数据建议失败只返回安全错误，不影响资产状态。预览按 NDJSON 顺序读取最多 50 行，绝不把完整对象作为预览响应。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/assets/routes.test.ts src/features/llm/client.test.ts`

### Task 3: 数据资产中心、详情、预览与元数据编辑 UI

**Files:**
- Create: `apps/web/src/features/assets/AssetListPage.tsx`
- Create: `apps/web/src/features/assets/AssetDetailPage.tsx`
- Create: `apps/web/src/features/assets/AssetMetadataEditor.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/assets/AssetListPage.test.tsx`
- Test: `apps/web/src/features/assets/AssetDetailPage.test.tsx`

- [ ] **Step 1: 写失败组件测试**

```tsx
expect(screen.getByRole('columnheader', { name: '名称' })).toBeVisible()
expect(screen.getByText('三年二班 2026 春季期中成绩')).toBeVisible()
expect(screen.getByRole('button', { name: '预览' })).toBeVisible()
expect(screen.getByText('展示前 50 行，共 42 行')).toBeVisible()
```

- [ ] **Step 2: 运行测试，确认页面不存在**

Run: `pnpm --filter @data-analyze/web test -- src/features/assets/AssetListPage.test.tsx src/features/assets/AssetDetailPage.test.tsx`

- [ ] **Step 3: 实现表格优先列表和预览优先详情**

列表使用名称、类型、模板、标签、行数、创建时间和操作列；详情顶部紧凑展示资产信息，随后展示前 50 行数据，再展示字段映射与来源。实现加载、空和错误状态，所有业务文案使用简体中文。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/web test -- src/features/assets/AssetListPage.test.tsx src/features/assets/AssetDetailPage.test.tsx`

---

## 阶段二：迁移单资产报表

### Task 4: 报表绑定数据资产并加入样例授权

**Files:**
- Create: `apps/worker/migrations/0006_report_assets.sql`
- Modify: `apps/worker/src/features/reports/service.ts`
- Modify: `apps/worker/src/features/reports/routes.ts`
- Modify: `apps/worker/src/features/reports/llm.ts`
- Modify: `apps/web/src/features/reports/ReportEditorPage.tsx`
- Test: `apps/worker/src/features/reports/routes.test.ts`
- Test: `apps/web/src/features/reports/ReportEditorPage.test.tsx`

- [ ] **Step 1: 写失败测试**

```ts
expect(llmInput.assetId).toBe(assetId)
expect(llmInput.sampleRows).toBeUndefined()
expect(llmInput.sampleRows).toEqual(firstFiveRows) // 仅 sampleAuthorized=true 时
```

- [ ] **Step 2: 运行测试，确认报表仍依赖 taskId**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/routes.test.ts`

- [ ] **Step 3: 实现资产关联和样例授权边界**

报表草稿请求接收 `assetId`、展示需求和 `sampleAuthorized`。未授权时 LLM 请求不含任何行；授权时读取固定前 5 行并只用于当前调用。样例不得写入报告配置、D1 记录或日志。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/routes.test.ts && pnpm --filter @data-analyze/web test -- src/features/reports/ReportEditorPage.test.tsx`

---

## 阶段三：R2 受控派生加工

### Task 5: 定义转换 DSL、计划与血缘契约

**Files:**
- Create: `packages/contracts/src/transformation.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/worker/migrations/0007_transformations.sql`
- Test: `packages/contracts/src/transformation.test.ts`

- [ ] **Step 1: 写失败协议测试**

```ts
expect(TransformationPlanSchema.safeParse(validJoinAndSubtractPlan).success).toBe(true)
expect(TransformationPlanSchema.safeParse({ ...validJoinAndSubtractPlan, code: 'await fetch()' }).success).toBe(false)
```

- [ ] **Step 2: 运行测试，确认契约不存在**

Run: `pnpm --filter @data-analyze/contracts test -- src/transformation.test.ts`

- [ ] **Step 3: 实现 DSL**

实现 `project`、`filter`、`join`、`append`、`derive`、`aggregate`、`sort`、`limit` 及结构化表达式 AST；未知字段、字符串公式、任意代码和未声明操作必须被严格拒绝。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/contracts test -- src/transformation.test.ts`

### Task 6: 生成、确认并执行 R2 plan.json

**Files:**
- Create: `apps/worker/src/features/transformations/service.ts`
- Create: `apps/worker/src/features/transformations/routes.ts`
- Create: `apps/worker/src/features/transformations/executor.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/src/features/transformations/routes.test.ts`
- Test: `apps/worker/src/features/transformations/executor.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(await env.DATA_BUCKET.get(`data-analyze/transformations/${id}/plan.json`)).not.toBeNull()
expect(createdAsset).toMatchObject({ kind: 'derived', status: 'ready' })
expect(planObjectText).not.toContain('sampleRows')
```

- [ ] **Step 2: 运行测试，确认计划没有写入 R2 或产生资产**

Run: `pnpm --filter @data-analyze/worker test -- src/features/transformations/routes.test.ts src/features/transformations/executor.test.ts`

- [ ] **Step 3: 实现生成、确认和执行**

草稿阶段调用 LLM 生成 DSL；确认阶段校验资产状态、Schema、类型和无环血缘，将不可变 `plan.json` 写入 R2，投递 Queue。执行器流式读取父资产，解释 DSL，输出 NDJSON/Schema/摘要，并创建 `derived` 资产和 `asset_lineage` 记录。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/transformations/routes.test.ts src/features/transformations/executor.test.ts`

### Task 7: 多资产选择、Prompt 辅助与自然语言确认 UI

**Files:**
- Create: `apps/web/src/features/transformations/TransformationComposerPage.tsx`
- Create: `apps/web/src/features/transformations/TransformationConfirmationPage.tsx`
- Modify: `apps/web/src/features/assets/AssetListPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Test: `apps/web/src/features/transformations/TransformationComposerPage.test.tsx`
- Test: `apps/web/src/features/transformations/TransformationConfirmationPage.test.tsx`

- [ ] **Step 1: 写失败组件测试**

```tsx
expect(screen.getByText('已选择 2 份数据')).toBeVisible()
expect(screen.getByText('期中成绩 · 前 5 行')).toBeVisible()
expect(screen.getByRole('checkbox', { name: '将当前预览的前 5 行样例发送给模型，辅助理解数据含义' })).not.toBeChecked()
expect(screen.getByText('按“学号”关联期中与期末成绩')).toBeVisible()
```

- [ ] **Step 2: 运行测试，确认页面不存在**

Run: `pnpm --filter @data-analyze/web test -- src/features/transformations/TransformationComposerPage.test.tsx src/features/transformations/TransformationConfirmationPage.test.tsx`

- [ ] **Step 3: 实现双栏编辑与自然语言确认**

左栏可在选中资产间切换预览并点击字段插入需求；右栏填写目标并选择样例授权。确认页展示输入资产、关联方式、计算字段、排序和预计输出，不展示 DSL、脚本、PR 或 GitHub 文案。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/web test -- src/features/transformations/TransformationComposerPage.test.tsx src/features/transformations/TransformationConfirmationPage.test.tsx`

## 完整验证

- [ ] **Step 1: 运行全量验证**

Run: `pnpm validate:scripts && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

- [ ] **Step 2: 验收主链路**

Playwright 覆盖：上传成绩表、确认映射、编辑资产元数据、预览前 50 行、创建单资产报表、选择两份资产、授权或不授权样例、确认 R2 计划、生成并预览派生资产。

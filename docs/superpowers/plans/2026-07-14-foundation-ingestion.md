# 工程基础与数据接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可部署的 TypeScript Monorepo，并完成分析模板、Prompt 版本、CSV/Excel 上传、结构检查和显式字段映射闭环。

**Architecture:** React/Vite 前端通过 Hono Worker API 操作 D1 和私有 R2。Worker 保存模板和元数据，流式上传原始文件，确定性解析字段并校验用户映射；完整业务数据不写入 D1。

**Tech Stack:** Node.js 22.23.1、pnpm 11.9.0、TypeScript 7.0.2、React 19.2.7、Vite 8.1.4、React Router 7.18.1、Hono 4.12.30、Zod 4.4.3、Drizzle ORM 0.45.2、Drizzle Kit 0.31.10、Wrangler 4.110.0、Vitest 4.1.10、Cloudflare Vitest Pool 0.18.4、csv-parse 7.0.1、iconv-lite 0.7.3、xlsx 0.18.5。

## Global Constraints

- 单个上传文件最大 10 MB、最大 10 万行、最大 200 列。
- 第一阶段只支持 CSV 和结构明确的 `.xlsx`；Excel 每次只处理用户明确选择的一个工作表。
- 所有字段映射必须由用户显式确认；缺少必填字段、字段类型错误或超限时终止，不做字段兜底、静默截断或自动抽样。
- R2 保存原始文件、Schema 和错误报告；D1 只保存模板、版本、映射、状态和 R2 Key。
- 代码中的函数、变量及复杂业务逻辑添加简体中文注释。
- 每项实现遵循 TDD；每个任务单独提交。
- 计划 1 至计划 3 只允许在本地或受限预发布环境运行；完成计划 4 的 Access 校验前不得公开部署。

---

## 文件职责映射

```text
package.json                              # 根脚本和固定工具版本
pnpm-workspace.yaml                       # Workspace 包范围
tsconfig.base.json                        # 共享 TypeScript 严格配置
apps/web/                                 # Pages React 应用
apps/worker/                              # Hono API 与 Cloudflare Bindings
packages/contracts/src/dataset.ts         # 数据集、字段和映射契约
packages/contracts/src/template.ts        # 分析模板与 Prompt 契约
apps/worker/src/db/schema.ts               # D1 表定义
apps/worker/migrations/0001_control.sql    # 控制面初始表
apps/worker/src/features/templates/        # 模板 API
apps/worker/src/features/datasets/         # 上传、解析和映射 API
apps/web/src/features/templates/           # 模板页面
apps/web/src/features/datasets/            # 上传和映射页面
```

### Task 1: 初始化 Monorepo 和可运行骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/worker/package.json`
- Create: `apps/worker/wrangler.jsonc`
- Create: `apps/worker/src/index.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `@data-analyze/contracts` Workspace 包、Pages 开发服务器、Worker `/health` 接口。

- [ ] **Step 1: 写入根配置和 Workspace 配置**

```json
{
  "name": "data-analyze-project",
  "private": true,
  "packageManager": "pnpm@11.9.0",
  "engines": { "node": "22.23.1" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

`tsconfig.base.json` 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noFallthroughCasesInSwitch`，目标设为 `ES2022`。

- [ ] **Step 2: 创建最小前端和 Worker 包**

三个 Workspace 包固定命名为 `@data-analyze/web`、`@data-analyze/worker`、`@data-analyze/contracts`。前端包脚本为 `dev: vite`、`build: vite build`、`typecheck: tsc --noEmit`、`test: vitest run`；Worker 包脚本为 `dev: wrangler dev`、`build: wrangler deploy --dry-run`、`typecheck: tsc --noEmit`、`test: vitest run`；契约包脚本为 `build: tsc -p tsconfig.json`、`typecheck: tsc --noEmit`、`test: vitest run`。

`apps/worker/src/index.ts`：

```ts
import { Hono } from 'hono'

export type Env = {
  Bindings: {
    DB: D1Database
    DATA_BUCKET: R2Bucket
  }
}

export const app = new Hono<Env>()

app.get('/health', (context) => context.json({ status: 'ok' as const }))

export default app
```

`apps/web/src/main.tsx`：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return <main>数据分析 Agent</main>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: 安装固定版本依赖**

Run:

```bash
pnpm install
pnpm --filter @data-analyze/web add react@19.2.7 react-dom@19.2.7 react-router-dom@7.18.1
pnpm --filter @data-analyze/web add -D vite@8.1.4 @vitejs/plugin-react@6.0.3 typescript@7.0.2 @types/react@19.2.17 @types/react-dom@19.2.3 @testing-library/react@16.3.2 @testing-library/jest-dom@6.9.1 @testing-library/user-event@14.6.1 jsdom@29.1.1
pnpm --filter @data-analyze/worker add hono@4.12.30 zod@4.4.3 drizzle-orm@0.45.2 csv-parse@7.0.1 iconv-lite@0.7.3 xlsx@0.18.5
pnpm --filter @data-analyze/worker add -D wrangler@4.110.0 drizzle-kit@0.31.10 @cloudflare/vitest-pool-workers@0.18.4 @cloudflare/workers-types@5.20260714.1
pnpm --filter @data-analyze/contracts add zod@4.4.3
```

Expected: 所有命令退出码为 0，`pnpm-lock.yaml` 生成。

- [ ] **Step 4: 验证骨架**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: 三个命令均退出码为 0；没有测试的包显示 `No test files found` 时应在包脚本中使用 `vitest run --passWithNoTests`。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .gitignore apps packages
git commit -m "build: initialize cloudflare monorepo"
```

### Task 2: 定义模板、字段和映射共享契约

**Files:**
- Create: `packages/contracts/src/dataset.test.ts`
- Create: `packages/contracts/src/dataset.ts`
- Create: `packages/contracts/src/template.test.ts`
- Create: `packages/contracts/src/template.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: Zod 4.4.3。
- Produces: `FieldDefinitionSchema`、`FieldMappingSchema`、`DatasetInspectionSchema`、`AnalysisTemplateSchema`、`PromptVersionSchema`。

- [ ] **Step 1: 写字段映射失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { FieldMappingListSchema } from './dataset'

describe('FieldMappingListSchema', () => {
  it('拒绝两个来源字段映射到同一个标准字段', () => {
    const result = FieldMappingListSchema.safeParse([
      { sourceField: '销售额', targetField: 'salesAmount' },
      { sourceField: '金额', targetField: 'salesAmount' },
    ])
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/contracts test -- dataset.test.ts`

Expected: FAIL，错误包含 `Cannot find module './dataset'` 或导出不存在。

- [ ] **Step 3: 实现契约**

```ts
import { z } from 'zod'

export const FieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date'])

export const FieldDefinitionSchema = z.object({
  name: z.string().min(1),
  type: FieldTypeSchema,
  description: z.string().min(1),
  required: z.boolean(),
})

export const FieldMappingSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
})

export const FieldMappingListSchema = z
  .array(FieldMappingSchema)
  .superRefine((mappings, context) => {
    // 显式禁止多对一映射，避免后写入字段覆盖先写入字段。
    const targets = new Set<string>()
    for (const mapping of mappings) {
      if (targets.has(mapping.targetField)) {
        context.addIssue({
          code: 'custom',
          message: `标准字段重复映射: ${mapping.targetField}`,
        })
      }
      targets.add(mapping.targetField)
    }
  })

export const DatasetInspectionSchema = z.object({
  rowCount: z.number().int().min(0).max(100_000),
  columnCount: z.number().int().min(1).max(200),
  sheets: z.array(z.string().min(1)),
  sourceFields: z.array(z.string().min(1)).max(200),
})
```

`template.ts` 定义 `AnalysisTemplateSchema`，其中 `fields` 至少一个且字段名唯一；`PromptVersionSchema.type` 只能是 `processing` 或 `reporting`。

- [ ] **Step 4: 补充模板唯一字段测试并运行全部契约测试**

Run: `pnpm --filter @data-analyze/contracts test`

Expected: PASS，至少 2 个测试文件、4 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts
git commit -m "feat(contracts): define ingestion schemas"
```

### Task 3: 建立 D1 控制面表和数据访问层

**Files:**
- Create: `apps/worker/src/db/schema.ts`
- Create: `apps/worker/src/db/client.ts`
- Create: `apps/worker/migrations/0001_control.sql`
- Create: `apps/worker/src/db/schema.test.ts`
- Modify: `apps/worker/wrangler.jsonc`

**Interfaces:**
- Consumes: `AnalysisTemplateSchema`、`PromptVersionSchema`。
- Produces: `analysisTemplates`、`promptVersions`、`datasets`、`datasetVersions`、`fieldMappings` 表和 `createDb(binding)`。

- [ ] **Step 1: 写数据库结构测试**

```ts
import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { analysisTemplates, datasetVersions } from './schema'

describe('D1 schema', () => {
  it('使用固定控制面表名', () => {
    expect(getTableName(analysisTemplates)).toBe('analysis_templates')
    expect(getTableName(datasetVersions)).toBe('dataset_versions')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/db/schema.test.ts`

Expected: FAIL，`./schema` 不存在。

- [ ] **Step 3: 创建 Drizzle Schema 和 SQL Migration**

`schema.ts` 使用 `sqliteTable`，所有 ID 使用文本 UUID，时间使用 ISO 8601 文本。`dataset_versions` 明确包含：

```ts
export const datasetVersions = sqliteTable('dataset_versions', {
  id: text('id').primaryKey(),
  datasetId: text('dataset_id').notNull(),
  sourceObjectKey: text('source_object_key').notNull().unique(),
  schemaObjectKey: text('schema_object_key'),
  errorObjectKey: text('error_object_key'),
  fileType: text('file_type', { enum: ['csv', 'xlsx'] }).notNull(),
  selectedSheet: text('selected_sheet'),
  rowCount: integer('row_count'),
  columnCount: integer('column_count'),
  validationStatus: text('validation_status', {
    enum: ['uploaded', 'awaiting_sheet', 'inspected', 'invalid', 'mapped'],
  }).notNull(),
  createdAt: text('created_at').notNull(),
})
```

Migration 创建外键和以下索引：`prompt_versions(template_id, type, version)`、`dataset_versions(dataset_id, created_at)`、`field_mappings(template_id, source_field)`。

- [ ] **Step 4: 应用本地 Migration 并运行测试**

Run: `pnpm --filter @data-analyze/worker exec wrangler d1 migrations apply data-analyze-db --local && pnpm --filter @data-analyze/worker test -- src/db/schema.test.ts`

Expected: Migration 显示成功；测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/db apps/worker/migrations apps/worker/wrangler.jsonc
git commit -m "feat(db): add ingestion control schema"
```

### Task 4: 实现分析模板和 Prompt 版本 API

**Files:**
- Create: `apps/worker/src/features/templates/service.ts`
- Create: `apps/worker/src/features/templates/routes.ts`
- Create: `apps/worker/src/features/templates/routes.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: D1 `analysis_templates`、`prompt_versions`，共享模板契约。
- Produces: `POST /api/templates`、`GET /api/templates`、`GET /api/templates/:id`、`POST /api/templates/:id/prompts`。

- [ ] **Step 1: 写创建模板 API 失败测试**

```ts
it('创建模板时同时写入加工和报表 Prompt v1', async () => {
  const response = await app.request('/api/templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: '销售分析',
      description: '销售数据模板',
      fields: [{ name: 'salesAmount', type: 'number', description: '销售额', required: true }],
      processingPrompt: '选择能够完成销售分析的完整脚本',
      reportingPrompt: '使用固定组件展示销售结果',
    }),
  }, testEnv)

  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ processingPromptVersion: 1, reportingPromptVersion: 1 })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: FAIL，路由返回 404。

- [ ] **Step 3: 实现模板 Service 和 Routes**

创建模板时使用 D1 batch 同时写模板及两个 Prompt v1。新增 Prompt 时查询同类型最大版本并加一；请求体必须通过 Zod 校验，校验失败返回：

```json
{
  "code": "INVALID_REQUEST",
  "message": "请求参数不符合模板协议",
  "details": []
}
```

不接受客户端传入 Prompt 版本号。

- [ ] **Step 4: 运行模板 API 测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/templates/routes.test.ts`

Expected: PASS，覆盖创建、列表、详情、Prompt 新版本和非法字段五类用例。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/templates apps/worker/src/index.ts
git commit -m "feat(api): add analysis template endpoints"
```

### Task 5: 实现原始文件上传和结构检查

**Files:**
- Create: `apps/worker/src/features/datasets/upload.ts`
- Create: `apps/worker/src/features/datasets/inspect-csv.ts`
- Create: `apps/worker/src/features/datasets/inspect-xlsx.ts`
- Create: `apps/worker/src/features/datasets/routes.ts`
- Create: `apps/worker/src/features/datasets/routes.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `DATA_BUCKET`、D1 数据集表、`DatasetInspectionSchema`。
- Produces: `POST /api/datasets`、`POST /api/datasets/:versionId/inspect`、`GET /api/datasets/:id`。

- [ ] **Step 1: 写 10 MB 和文件类型限制测试**

```ts
it('拒绝超过 10 MB 的文件', async () => {
  const response = await uploadDataset({
    contentLength: 10 * 1024 * 1024 + 1,
    contentType: 'text/csv',
    fileName: 'too-large.csv',
  })
  expect(response.status).toBe(413)
  expect(await response.json()).toMatchObject({ code: 'FILE_TOO_LARGE' })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/datasets/routes.test.ts`

Expected: FAIL，上传路由不存在。

- [ ] **Step 3: 实现流式上传和确定性解析**

上传接口要求 `content-length`、`x-file-name`、`x-template-id`，只接受 `text/csv` 和 `.xlsx` 对应 MIME。对象 Key 固定为：

```ts
const objectKey = `data-analyze/datasets/${datasetId}/${versionId}/source/original.${fileType}`
```

CSV 只支持用户明确选择的 `utf-8`、`utf-8-bom`、`gb18030` 编码以及逗号、制表符、分号三种分隔符。使用 `iconv-lite` 解码并通过 `csv-parse` 逐行计数、收集表头；超过 10 万行或 200 列立即停止。XLSX 使用 `XLSX.read(arrayBuffer, { dense: true })` 读取工作表清单；未选择工作表时返回 `awaiting_sheet`，选择后只检查该工作表。

复杂解析循环必须写中文注释，说明提前终止和内存限制原因。

- [ ] **Step 4: 运行上传和检查测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/datasets/routes.test.ts`

Expected: PASS，覆盖 CSV、XLSX 多工作表、超行、超列、超大小和未知类型。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/datasets apps/worker/src/index.ts
git commit -m "feat(api): add dataset upload and inspection"
```

### Task 6: 完成模板、上传和字段映射前端闭环

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/features/templates/TemplateListPage.tsx`
- Create: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Create: `apps/web/src/features/datasets/DatasetUploadPage.tsx`
- Create: `apps/web/src/features/datasets/FieldMappingPage.tsx`
- Create: `apps/web/src/features/datasets/FieldMappingPage.test.tsx`
- Create: `apps/worker/src/features/datasets/mapping.ts`
- Modify: `apps/worker/src/features/datasets/routes.ts`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: 模板 API、数据集上传及检查 API、`FieldMappingListSchema`。
- Produces: `PUT /api/datasets/:versionId/mapping` 和可操作的模板、上传、映射页面。

- [ ] **Step 1: 写缺少必填映射的失败测试**

```tsx
it('必填标准字段未映射时禁用确认按钮', async () => {
  render(<FieldMappingPage template={requiredSalesTemplate} inspection={regionOnlyInspection} />)
  expect(screen.getByRole('button', { name: '确认字段映射' })).toBeDisabled()
  expect(screen.getByText('未映射必填字段：salesAmount')).toBeVisible()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- FieldMappingPage.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现映射验证和保存**

服务端 `validateMapping` 必须：

```ts
export function validateMapping(
  sourceFields: string[],
  templateFields: FieldDefinition[],
  mappings: FieldMapping[],
): MappingValidationResult {
  // 只接受文件中真实存在的来源字段和模板中真实存在的目标字段。
  const unknownSources = mappings.filter((item) => !sourceFields.includes(item.sourceField))
  const unknownTargets = mappings.filter(
    (item) => !templateFields.some((field) => field.name === item.targetField),
  )
  const mappedTargets = new Set(mappings.map((item) => item.targetField))
  const missingRequired = templateFields
    .filter((field) => field.required && !mappedTargets.has(field.name))
    .map((field) => field.name)

  return { unknownSources, unknownTargets, missingRequired }
}
```

任一数组非空时返回 422；全部为空时以事务替换当前模板对应映射，并将数据集版本状态改为 `mapped`。

- [ ] **Step 4: 实现页面和路由**

前端使用 React Router 创建 `/templates`、`/templates/new`、`/datasets/new`、`/datasets/:versionId/mapping`。CSV 上传页要求用户明确选择编码和分隔符，并随 inspect 请求发送；映射页使用两个显式下拉框，不提供自动猜测按钮；未知来源字段标记为“忽略”，但不自动写入映射。

- [ ] **Step 5: 运行完整计划验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 所有命令退出码为 0；上传和映射集成测试覆盖成功及所有明确拒绝路径。

- [ ] **Step 6: 提交**

```bash
git add apps/web apps/worker/src/features/datasets
git commit -m "feat: complete explicit field mapping flow"
```

## 计划 1 验收结果

完成后，用户能够创建带两个版本化 Prompt 的分析模板，上传符合限制的 CSV 或 Excel，选择 Excel 工作表，查看确定性结构检查结果，并显式确认字段映射。系统尚不调用 LLM，也不执行数据加工脚本。

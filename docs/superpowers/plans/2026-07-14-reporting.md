# 报表配置与固定组件渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将成功加工结果转换为受控报表数据，由 LLM 生成严格 JSON 配置，经用户预览确认后使用固定 React/ECharts 组件发布版本化报表。

**Architecture:** Worker 只向 LLM 发送结果 Schema、报表 Prompt、展示需求和组件清单。Worker 从私有 R2 物化受限报表数据、校验字段引用和规模，再保存版本化 `report.json` 与 `data.json`；Pages 通过 API 获取并使用固定组件渲染。

**Tech Stack:** 继承计划 1、2；React 19.2.7、ECharts 6.1.0、Zod 4.4.3、Hono 4.12.30、R2、D1、Vitest 4.1.10。

## Global Constraints

- 必须先完成 `2026-07-14-foundation-ingestion.md` 和 `2026-07-14-analysis-execution.md`。
- LLM 不读取任何实际数据值，只接收结果字段名称、类型、说明、报表 Prompt、展示需求和固定组件协议。
- LLM 只能输出受控 JSON，不得输出 HTML、JavaScript、CSS 或运行时表达式。
- 单个 `report/data.json` 不超过 5 MB；单图不超过 5,000 个数据点；表格不超过 10,000 行。
- 超限、未知字段、未知组件或非法布局时拒绝发布，不做字段替换、抽样或截断。
- 报表数据提前生成；浏览器只执行本地筛选、排序和组件联动，不发起实时 SQL 查询。
- 代码中的函数、变量及复杂业务逻辑添加简体中文注释。
- 每项实现遵循 TDD；每个任务单独提交。

---

## 文件职责映射

```text
packages/report-schema/src/index.ts              # 报表组件、布局和配置契约
packages/report-schema/src/validate-fields.ts    # 字段引用和规模校验
apps/worker/migrations/0003_reports.sql           # 报表及版本表
apps/worker/src/features/reports/materialize.ts   # NDJSON 到受限 data.json
apps/worker/src/features/reports/llm.ts           # 报表 LLM 请求
apps/worker/src/features/reports/routes.ts        # 草稿、确认、读取 API
apps/web/src/features/reports/components/         # 固定报表组件
apps/web/src/features/reports/ReportEditorPage.tsx
apps/web/src/features/reports/ReportViewPage.tsx
```

### Task 1: 定义报表 JSON Schema 和确定性校验器

**Files:**
- Create: `packages/report-schema/package.json`
- Create: `packages/report-schema/src/index.ts`
- Create: `packages/report-schema/src/index.test.ts`
- Create: `packages/report-schema/src/validate-fields.ts`
- Create: `packages/report-schema/src/validate-fields.test.ts`

**Interfaces:**
- Consumes: 标准字段类型。
- Produces: `ReportConfigSchema`、`ReportWidgetSchema`、`validateReportReferences(config, schema, stats)`。

- [ ] **Step 1: 写未知组件和未知字段失败测试**

```ts
it('拒绝未注册组件类型', () => {
  const result = ReportConfigSchema.safeParse({
    title: '销售报表',
    description: '销售概览',
    filters: [],
    widgets: [{ id: 'x', type: 'custom-html', layout: { x: 0, y: 0, w: 6, h: 4 } }],
  })
  expect(result.success).toBe(false)
})

it('拒绝引用结果 Schema 中不存在的指标', () => {
  const issues = validateReportReferences(barReport('missingMetric'), resultSchema, { rowCount: 100, byteSize: 2048 })
  expect(issues).toContainEqual({ code: 'UNKNOWN_FIELD', field: 'missingMetric' })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/report-schema test`

Expected: FAIL，报表包或导出不存在。

- [ ] **Step 3: 实现判别联合 Schema**

`packages/report-schema/package.json` 固定命名为 `@data-analyze/report-schema`，通过 `workspace:*` 依赖 `@data-analyze/contracts`，并固定依赖 `zod@4.4.3`。

```ts
const LayoutSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
})

const ChartWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['bar', 'line', 'pie']),
  title: z.string().min(1),
  dataset: z.literal('result'),
  dimension: z.string().min(1),
  metric: z.string().min(1),
  layout: LayoutSchema,
})

const MetricWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.literal('metric'),
  title: z.string().min(1),
  dataset: z.literal('result'),
  metric: z.string().min(1),
  aggregation: z.enum(['sum', 'average', 'min', 'max', 'count']),
  format: z.enum(['number', 'percent', 'currency']),
  layout: LayoutSchema,
})

const TableWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.literal('table'),
  title: z.string().min(1),
  dataset: z.literal('result'),
  columns: z.array(z.string().min(1)).min(1).max(30),
  layout: LayoutSchema,
})
```

增加 `select`、`multi-select`、`date-range` 过滤器；组件 ID 必须唯一。校验器检查全部字段引用、`x + w <= 12`、5 MB、5,000 图表点和 10,000 表格行限制。

- [ ] **Step 4: 运行报表契约测试**

Run: `pnpm --filter @data-analyze/report-schema test`

Expected: PASS，覆盖所有七类组件/筛选器、未知字段、非法布局和三类规模限制。

- [ ] **Step 5: 提交**

```bash
git add packages/report-schema
git commit -m "feat(report): define constrained report schema"
```

### Task 2: 建立报表表结构和 R2 数据物化器

**Files:**
- Create: `apps/worker/migrations/0003_reports.sql`
- Modify: `apps/worker/src/db/schema.ts`
- Create: `apps/worker/src/features/reports/materialize.ts`
- Create: `apps/worker/src/features/reports/materialize.test.ts`

**Interfaces:**
- Consumes: 成功任务的 `result/data.ndjson` 和 `result/schema.json`。
- Produces: `reports`、`report_versions` 表，`materializeReportData(task, env)`。

- [ ] **Step 1: 写 5 MB 和 10,000 行限制测试**

```ts
it('超过表格行上限时不写入 report data', async () => {
  const input = createNdjsonRows(10_001)
  await expect(materializeReportData(input, bucket)).rejects.toMatchObject({
    code: 'REPORT_TABLE_ROW_LIMIT_EXCEEDED',
  })
  expect(bucket.put).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/materialize.test.ts`

Expected: FAIL，物化器不存在。

- [ ] **Step 3: 实现表结构和物化器**

`report_versions` 保存 `report_id`、`version`、`user_requirement`、`prompt_version_id`、`config_object_key`、`data_object_key`、`validation_status`、`confirmed_at`、`created_at`。

物化器逐行读取 NDJSON，在内存中构造数组时按最终 JSON 的方括号、逗号和每行序列化结果累计 UTF-8 字节数；超过 10,000 行或 5 MB 立即抛出永久错误，不写部分正式对象。成功对象 Key：

```ts
const dataKey = `data-analyze/reports/${reportId}/${version}/data.json`
```

- [ ] **Step 4: 应用 Migration 并运行测试**

Run: `pnpm --filter @data-analyze/worker exec wrangler d1 migrations apply data-analyze-db --local && pnpm --filter @data-analyze/worker test -- src/features/reports/materialize.test.ts`

Expected: Migration 成功；物化器测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/migrations/0003_reports.sql apps/worker/src/db/schema.ts apps/worker/src/features/reports/materialize.ts apps/worker/src/features/reports/materialize.test.ts
git commit -m "feat(report): persist versioned report datasets"
```

### Task 3: 实现不读取数据值的报表 LLM 客户端

**Files:**
- Create: `apps/worker/src/features/reports/llm.ts`
- Create: `apps/worker/src/features/reports/llm.test.ts`

**Interfaces:**
- Consumes: 任务结果 Schema、报表 Prompt、展示需求、固定组件 Schema。
- Produces: `requestReportConfig(input, env): Promise<ReportConfig>`。

- [ ] **Step 1: 写上下文泄露防护测试**

```ts
it('报表请求中不包含 R2 数据内容和对象地址', async () => {
  await requestReportConfig({
    fields: resultFields,
    reportingPrompt: '生成区域销售概览',
    userRequirement: '使用柱状图',
  }, env)

  const requestBody = JSON.stringify(fetchMock.calls[0]?.[1]?.body)
  expect(requestBody).not.toContain('华东')
  expect(requestBody).not.toContain('data-analyze/tasks/')
  expect(requestBody).toContain('bar')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/llm.test.ts`

Expected: FAIL，客户端不存在。

- [ ] **Step 3: 实现报表平台规则和响应校验**

平台规则明确禁止未知字段、未知组件、HTML、JavaScript、CSS 和表达式。客户端复用统一 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，响应必须通过 `ReportConfigSchema.parse`。

- [ ] **Step 4: 运行报表 LLM 测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/llm.test.ts`

Expected: PASS，覆盖正常配置、未知组件、非 JSON、超时和实际数据隔离。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/reports/llm.ts apps/worker/src/features/reports/llm.test.ts
git commit -m "feat(llm): generate constrained report configs"
```

### Task 4: 实现报表草稿、校验、确认和私有读取 API

**Files:**
- Create: `apps/worker/src/features/reports/service.ts`
- Create: `apps/worker/src/features/reports/routes.ts`
- Create: `apps/worker/src/features/reports/routes.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `materializeReportData`、`requestReportConfig`、`validateReportReferences`、R2。
- Produces: `POST /api/tasks/:taskId/reports`、`GET /api/report-versions/:id`、`POST /api/report-versions/:id/confirm`、`GET /api/report-versions/:id/data`。

- [ ] **Step 1: 写“草稿不得直接发布”测试**

```ts
it('配置校验通过后仍需用户确认才发布', async () => {
  const draft = await createReportDraft(succeededTaskId, request, env)
  expect(draft.validationStatus).toBe('valid')
  expect(draft.confirmedAt).toBeNull()

  const detail = await app.request(`/api/report-versions/${draft.id}`, {}, env)
  expect(await detail.json()).toMatchObject({ published: false })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/routes.test.ts`

Expected: FAIL，报表路由不存在。

- [ ] **Step 3: 实现草稿和确认流程**

创建草稿顺序固定为：确认来源任务 `succeeded`、读取结果 Schema、调用 LLM、物化报表数据、校验字段和规模、保存 `report.json`、写 D1 草稿记录。任一步失败都不设置 `confirmed_at`。

确认接口只更新当前草稿；重复确认返回原版本。数据读取接口根据 D1 中精确 R2 Key 流式返回 JSON，禁止客户端传入任意对象 Key。

- [ ] **Step 4: 运行报表 API 测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/reports/routes.test.ts`

Expected: PASS，覆盖失败任务、非法配置、超限、确认、重复确认和私有数据读取。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/reports apps/worker/src/index.ts
git commit -m "feat(api): add report draft and publish flow"
```

### Task 5: 实现固定报表组件和本地筛选状态

**Files:**
- Create: `apps/web/src/features/reports/components/MetricCard.tsx`
- Create: `apps/web/src/features/reports/components/DataTable.tsx`
- Create: `apps/web/src/features/reports/components/EChartWidget.tsx`
- Create: `apps/web/src/features/reports/components/ReportFilters.tsx`
- Create: `apps/web/src/features/reports/ReportRenderer.tsx`
- Create: `apps/web/src/features/reports/ReportRenderer.test.tsx`
- Create: `apps/web/src/features/reports/filter-data.ts`
- Create: `apps/web/src/features/reports/filter-data.test.ts`

**Interfaces:**
- Consumes: `ReportConfig`、通过 API 获取的 `StandardRecord[]`。
- Produces: `<ReportRenderer config data />` 和 `filterReportData(data, filters, values)`。

- [ ] **Step 1: 写组件白名单和筛选测试**

Run: `pnpm --filter @data-analyze/web add echarts@6.1.0`

```tsx
it('只渲染 Schema 已注册的图表组件', () => {
  render(<ReportRenderer config={barReportConfig} data={reportRows} />)
  expect(screen.getByRole('heading', { name: '区域销售额' })).toBeVisible()
  expect(screen.queryByTestId('raw-html')).not.toBeInTheDocument()
})

it('多选筛选只保留明确选中的值', () => {
  expect(filterReportData(reportRows, regionFilter, ['华东'])).toEqual([
    { region: '华东', totalAmount: 150 },
  ])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/reports`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现固定组件和 CSS Grid 布局**

`ReportRenderer` 使用 `switch(widget.type)` 显式映射 `metric`、`table`、`bar`、`line`、`pie`，不使用动态 import、`eval` 或 HTML 注入。布局使用 12 列 CSS Grid，移动端媒体查询统一改为单列，不接受配置中的 CSS。

ECharts 配置只由受控字段生成；标题、维度和指标文本按普通字符串传入，不使用富文本 formatter 函数。

- [ ] **Step 4: 运行组件测试**

Run: `pnpm --filter @data-analyze/web test -- src/features/reports`

Expected: PASS，覆盖五类展示组件、三类筛选器、空数据和移动布局类名。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/reports
git commit -m "feat(web): render reports with fixed components"
```

### Task 6: 完成报表编辑、预览和发布页面

**Files:**
- Create: `apps/web/src/features/reports/ReportEditorPage.tsx`
- Create: `apps/web/src/features/reports/ReportViewPage.tsx`
- Create: `apps/web/src/features/reports/ReportEditorPage.test.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes: 报表草稿、确认、配置和数据 API，`ReportRenderer`。
- Produces: `/tasks/:taskId/reports/new`、`/reports/:reportVersionId`。

- [ ] **Step 1: 写预览确认门槛测试**

```tsx
it('只有有效草稿才显示发布按钮', async () => {
  render(<ReportEditorPage taskId="task-1" />)
  await userEvent.type(screen.getByLabelText('本次展示需求'), '按区域展示销售额')
  await userEvent.click(screen.getByRole('button', { name: '生成预览' }))
  expect(await screen.findByText('区域销售概览')).toBeVisible()
  expect(screen.getByRole('button', { name: '确认发布' })).toBeEnabled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- ReportEditorPage.test.tsx`

Expected: FAIL，页面不存在。

- [ ] **Step 3: 实现编辑和查看页面**

编辑页提供报表模板 Prompt、本次展示需求、生成预览、配置错误列表和确认发布按钮。Prompt 内容发生变化时，先调用计划 1 的 Prompt 版本接口创建 `reporting` 新版本，再以返回的版本 ID 创建报表草稿。查看页同时获取配置与数据，加载失败时展示明确错误码，不使用空报表兜底。

- [ ] **Step 4: 运行计划 3 完整验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 全部退出码为 0；报表测试不调用真实模型。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/reports apps/web/src/router.tsx
git commit -m "feat(web): add report preview and publishing"
```

## 计划 3 验收结果

完成后，用户能够从成功任务创建报表草稿，使用可编辑模板 Prompt 和本次需求生成受控配置，预览固定组件，确认发布版本化报表，并进行本地筛选和排序。LLM 全程不读取实际数据值。

# LLM 推荐与异步数据执行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成字段映射的数据集上，实现不读取实际数据行的 LLM 单脚本推荐、人工确认、Queue 异步执行和版本化结果写入。

**Architecture:** Worker 以共享 Zod Schema 构造 LLM 请求并校验决策，确认后仅将 `taskId` 投递到 Queue。Queue Consumer 根据确认快照加载精确脚本版本，流式标准化数据并写入 R2；D1 只记录计划、任务状态和结果 Key。

**Tech Stack:** 继承计划 1；Hono 4.12.30、Zod 4.4.3、Drizzle ORM 0.45.2、Cloudflare Queues、R2、Vitest 4.1.10。

## Global Constraints

- 必须先完成 `2026-07-14-foundation-ingestion.md`。
- LLM 只接收字段定义、类型、行列数、脚本元数据、模板 Prompt 和本次需求；不得接收实际数据行或 R2 URL。
- LLM 只能推荐一个真实存在的脚本及精确版本，不得生成代码或组合脚本。
- 用户确认后才创建任务；执行时不重新调用 LLM，不重新选择脚本。
- 缺字段、类型错误、非法参数和输出 Schema 错误均终止，不做字段或参数兜底。
- Queue 消息只包含 `taskId`；任务必须幂等，暂时性错误最多重试三次。
- 代码中的函数、变量及复杂业务逻辑添加简体中文注释。
- 每项实现遵循 TDD；每个任务单独提交。

---

## 文件职责映射

```text
packages/contracts/src/script.ts              # 脚本 metadata、参数和 LLM 决策契约
packages/script-sdk/src/index.ts               # 受控脚本运行接口
packages/scripts/src/registry.ts               # 构建期脚本注册表
packages/scripts/src/sales-region-summary.ts   # 首个完整示例脚本
apps/worker/src/features/llm/                   # LLM 客户端和上下文构造
apps/worker/src/features/plans/                 # 推荐、确认 API
apps/worker/src/features/tasks/                 # 任务状态、Queue Consumer、执行器
apps/web/src/features/analysis/                 # 需求输入、推荐确认、任务状态页面
apps/worker/migrations/0002_execution.sql       # 脚本、计划和任务表
```

### Task 1: 定义脚本 SDK 和推荐契约

**Files:**
- Create: `packages/contracts/src/script.test.ts`
- Create: `packages/contracts/src/script.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/script-sdk/package.json`
- Create: `packages/script-sdk/src/index.ts`

**Interfaces:**
- Consumes: 计划 1 的 `FieldDefinitionSchema`。
- Produces: `ScriptMetadataSchema`、`ScriptDecisionSchema`、`ProcessContext`、`ProcessResult`、`DataProcessor`。

- [ ] **Step 1: 写推荐协议失败测试**

```ts
it('supported 为 false 时拒绝携带脚本和参数', () => {
  const result = ScriptDecisionSchema.safeParse({
    supported: false,
    scriptId: 'invented-script',
    scriptVersion: '1.0.0',
    parameters: {},
    reason: '当前能力不支持',
    limitations: ['缺少能力'],
  })
  expect(result.success).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/contracts test -- script.test.ts`

Expected: FAIL，`ScriptDecisionSchema` 不存在。

- [ ] **Step 3: 实现判别联合和 SDK**

`packages/script-sdk/package.json` 固定命名为 `@data-analyze/script-sdk`，并通过 `workspace:*` 依赖 `@data-analyze/contracts`。

```ts
export const SupportedScriptDecisionSchema = z.object({
  supported: z.literal(true),
  scriptId: z.string().min(1),
  scriptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  parameters: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  limitations: z.array(z.string()),
})

export const UnsupportedScriptDecisionSchema = z.object({
  supported: z.literal(false),
  scriptId: z.null(),
  scriptVersion: z.null(),
  parameters: z.null(),
  reason: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
})

export const ScriptDecisionSchema = z.discriminatedUnion('supported', [
  SupportedScriptDecisionSchema,
  UnsupportedScriptDecisionSchema,
])
```

```ts
export type StandardRecord = Readonly<Record<string, string | number | boolean>>

export interface OutputWriter {
  write(record: StandardRecord): Promise<void>
}

export interface ProcessContext<TParameters> {
  readonly taskId: string
  readonly scriptId: string
  readonly scriptVersion: string
  readonly parameters: TParameters
  readonly input: AsyncIterable<StandardRecord>
  readonly output: OutputWriter
  readonly logger: {
    info(message: string, fields?: Record<string, string | number>): void
  }
}

export interface ProcessResult {
  rowCount: number
  summary: Readonly<Record<string, string | number | boolean>>
}

export interface DataProcessor<TParameters> {
  metadata: ScriptMetadata
  parseParameters(input: unknown): TParameters
  parseOutput(record: unknown): StandardRecord
  process(context: ProcessContext<TParameters>): Promise<ProcessResult>
}
```

`metadata` 中的输入、参数和输出描述必须是可 JSON 序列化的 Schema 子集，供 LLM 和页面读取；`parseParameters` 与 `parseOutput` 执行运行时严格校验，禁止把 Zod 实例直接序列化给 LLM。

- [ ] **Step 4: 运行契约测试**

Run: `pnpm --filter @data-analyze/contracts test && pnpm --filter @data-analyze/script-sdk typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts packages/script-sdk
git commit -m "feat(sdk): define processor and decision contracts"
```

### Task 2: 建立版本化脚本注册表和示例完整脚本

**Files:**
- Create: `packages/scripts/package.json`
- Create: `packages/scripts/src/registry.ts`
- Create: `packages/scripts/src/registry.test.ts`
- Create: `packages/scripts/src/sales-region-summary.ts`
- Create: `packages/scripts/src/sales-region-summary.test.ts`

**Interfaces:**
- Consumes: `DataProcessor`、`ScriptMetadataSchema`。
- Produces: `getScript(id, version)`、`listScriptMetadata()` 和 `sales-region-summary@1.0.0`。

- [ ] **Step 1: 写注册表和脚本失败测试**

```ts
it('按精确 ID 和版本读取脚本', () => {
  expect(getScript('sales-region-summary', '1.0.0').metadata.name).toBe('区域销售汇总')
  expect(() => getScript('sales-region-summary', '9.9.9')).toThrow('SCRIPT_NOT_FOUND')
})

it('按区域汇总销售额和订单数', async () => {
  const result = await runFixture(salesRegionSummary, [
    { region: '华东', salesAmount: 100, orderId: 'A' },
    { region: '华东', salesAmount: 50, orderId: 'B' },
  ])
  expect(result.output).toEqual([
    { region: '华东', totalAmount: 150, orderCount: 2, averageAmount: 75 },
  ])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/scripts test`

Expected: FAIL，脚本和注册表不存在。

- [ ] **Step 3: 实现完整脚本和静态注册表**

`packages/scripts/package.json` 固定命名为 `@data-analyze/scripts`，并通过 `workspace:*` 依赖 `@data-analyze/contracts` 和 `@data-analyze/script-sdk`。

`sales-region-summary` 固定要求 `region:string`、`salesAmount:number`、`orderId:string`，参数只允许 `includeEmptyRegion:boolean`。`parseParameters` 拒绝缺失和额外参数，`parseOutput` 校验四个精确输出字段。脚本使用 `Map` 聚合，遇到空区域且参数为 `false` 时返回业务错误，不为其生成默认区域名。

```ts
const scripts = new Map<string, DataProcessor<unknown>>([
  [`${salesRegionSummary.metadata.id}@${salesRegionSummary.metadata.version}`, salesRegionSummary],
])

export function getScript(id: string, version: string): DataProcessor<unknown> {
  const script = scripts.get(`${id}@${version}`)
  if (!script) throw new Error('SCRIPT_NOT_FOUND')
  return script
}

export function listScriptMetadata(): ScriptMetadata[] {
  return [...scripts.values()].map((script) => script.metadata)
}
```

- [ ] **Step 4: 运行脚本测试和类型检查**

Run: `pnpm --filter @data-analyze/scripts test && pnpm --filter @data-analyze/scripts typecheck`

Expected: PASS，未知版本、空区域、正常聚合和输出 Schema 均有断言。

- [ ] **Step 5: 提交**

```bash
git add packages/scripts
git commit -m "feat(scripts): add versioned processor registry"
```

### Task 3: 增加执行计划和任务数据表

**Files:**
- Create: `apps/worker/migrations/0002_execution.sql`
- Modify: `apps/worker/src/db/schema.ts`
- Create: `apps/worker/src/db/execution-schema.test.ts`

**Interfaces:**
- Consumes: 计划 1 的模板和数据集表。
- Produces: `scripts`、`execution_plans`、`processing_tasks` 表。

- [ ] **Step 1: 写任务状态约束测试**

```ts
it('任务初始状态只能是 queued', () => {
  expect(ProcessingTaskInsertSchema.safeParse({ id: crypto.randomUUID(), status: 'queued' }).success).toBe(true)
  expect(ProcessingTaskInsertSchema.safeParse({ id: crypto.randomUUID(), status: 'done' }).success).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/db/execution-schema.test.ts`

Expected: FAIL，新表导出不存在。

- [ ] **Step 3: 创建表和索引**

`execution_plans` 保存 `model_name`、`prompt_version_id`、`user_requirement`、`decision_json`、`script_id`、`script_version`、`parameters_json`、`confirmation_status`、`confirmed_at`。`processing_tasks.status` 只能为 `queued`、`running`、`succeeded`、`failed`，并保存结果和错误 R2 Key、重试次数及时间。

- [ ] **Step 4: 应用 Migration 并运行测试**

Run: `pnpm --filter @data-analyze/worker exec wrangler d1 migrations apply data-analyze-db --local && pnpm --filter @data-analyze/worker test -- src/db/execution-schema.test.ts`

Expected: Migration 成功；测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/migrations/0002_execution.sql apps/worker/src/db
git commit -m "feat(db): add plans and processing tasks"
```

### Task 4: 实现严格的 LLM 请求构造和客户端

**Files:**
- Create: `apps/worker/src/features/llm/prompt.ts`
- Create: `apps/worker/src/features/llm/prompt.test.ts`
- Create: `apps/worker/src/features/llm/client.ts`
- Create: `apps/worker/src/features/llm/client.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `listScriptMetadata()`、数据集 Schema、Prompt 版本、本次需求。
- Produces: `buildProcessingContext(input)`、`requestScriptDecision(context, env)`。

- [ ] **Step 1: 写“不得包含实际数据”测试**

```ts
it('构造上下文时只序列化 Schema 和计数', () => {
  const context = buildProcessingContext({
    rowCount: 2,
    columnCount: 2,
    fields: [{ name: 'region', type: 'string', description: '区域', required: true }],
    scripts: [scriptMetadata],
    templatePrompt: '选择完整脚本',
    userRequirement: '按区域汇总',
  })

  const serialized = JSON.stringify(context)
  expect(serialized).not.toContain('华东')
  expect(Object.keys(context.dataset).sort()).toEqual(['columnCount', 'fields', 'rowCount'])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/llm`

Expected: FAIL，LLM 模块不存在。

- [ ] **Step 3: 实现平台规则和统一模型调用**

Worker Bindings 增加 `LLM_BASE_URL`、`LLM_MODEL`，Secret 增加 `LLM_API_KEY`。客户端向 `${LLM_BASE_URL}/chat/completions` 发送统一模型名，要求 JSON Schema 响应；响应文本必须使用 `ScriptDecisionSchema.parse`。

平台规则必须逐字包含：只能选择一个清单内脚本、不得生成代码、不得组合脚本、不得发明字段或参数、无法满足时返回 `supported:false`。

- [ ] **Step 4: 运行 LLM 模块测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/llm`

Expected: PASS，覆盖成功、非 JSON、Schema 错误、HTTP 超时和模型拒绝。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/llm apps/worker/src/index.ts apps/worker/wrangler.jsonc
git commit -m "feat(llm): add constrained script recommendation"
```

### Task 5: 实现推荐、人工确认和 Queue 投递 API

**Files:**
- Create: `apps/worker/src/features/plans/service.ts`
- Create: `apps/worker/src/features/plans/routes.ts`
- Create: `apps/worker/src/features/plans/routes.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/wrangler.jsonc`

**Interfaces:**
- Consumes: `requestScriptDecision`、D1 计划表、`TASK_QUEUE`。
- Produces: `POST /api/dataset-versions/:id/plans`、`GET /api/plans/:id`、`POST /api/plans/:id/confirm`。

- [ ] **Step 1: 写“未确认不投递”和精确版本校验测试**

```ts
it('只有确认受支持计划时才投递 taskId', async () => {
  const response = await app.request(`/api/plans/${supportedPlanId}/confirm`, { method: 'POST' }, env)
  expect(response.status).toBe(202)
  expect(env.TASK_QUEUE.send).toHaveBeenCalledWith({ taskId: expect.any(String) })
})

it('拒绝确认不存在的脚本版本', async () => {
  const response = await app.request(`/api/plans/${stalePlanId}/confirm`, { method: 'POST' }, env)
  expect(response.status).toBe(409)
  expect(env.TASK_QUEUE.send).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts`

Expected: FAIL，计划路由不存在。

- [ ] **Step 3: 实现推荐与确认事务**

创建推荐时保存原始结构化决策。确认时再次校验脚本存在、版本一致、输入 Schema 和参数 Schema；在 D1 batch 中将计划改为 `confirmed` 并创建 `queued` 任务，然后发送 `{ taskId }`。发送失败时将任务标记为 `failed`，错误码为 `QUEUE_PUBLISH_FAILED`。

- [ ] **Step 4: 运行计划 API 测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts`

Expected: PASS，覆盖受支持、不支持、重复确认、失效版本和 Queue 失败。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/plans apps/worker/src/index.ts apps/worker/wrangler.jsonc
git commit -m "feat(api): add plan confirmation and queueing"
```

### Task 6: 实现流式标准化和幂等脚本执行器

**Files:**
- Create: `apps/worker/src/features/tasks/normalize.ts`
- Create: `apps/worker/src/features/tasks/output-writer.ts`
- Create: `apps/worker/src/features/tasks/executor.ts`
- Create: `apps/worker/src/features/tasks/executor.test.ts`
- Create: `apps/worker/src/features/tasks/consumer.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: 任务确认快照、字段映射、R2 原始文件、`getScript()`。
- Produces: `executeTask(taskId, env)`、Queue `queue(batch, env)` handler、R2 标准化和结果对象。

- [ ] **Step 1: 写类型错误和重复任务测试**

```ts
it('number 字段出现非数字文本时永久失败', async () => {
  await expect(executeFixture([{ 销售额: '一百元' }])).rejects.toMatchObject({
    code: 'FIELD_TYPE_MISMATCH',
    retryable: false,
  })
})

it('已成功任务不重复执行脚本', async () => {
  await executeTask(succeededTaskId, env)
  expect(script.process).not.toHaveBeenCalled()
  expect(env.DATA_BUCKET.put).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/tasks/executor.test.ts`

Expected: FAIL，执行器不存在。

- [ ] **Step 3: 实现严格标准化**

标准化器只接受明确格式：number 使用完整数字正则后调用 `Number`；boolean 只接受布尔值或字符串 `true`、`false`；date 只接受 `YYYY-MM-DD`。任何其他值写入错误报告并终止，不使用空串、零、当前日期或相似字段兜底。

标准化器将完成显式映射和严格类型转换的记录同步写入 `data-analyze/datasets/{datasetId}/{datasetVersion}/normalized/data.ndjson`，并作为 AsyncIterable 传给脚本。脚本输出先写入 `temporary/processing.ndjson`；脚本完成并通过输出 Schema 后，将最终对象写入 `result/data.ndjson`、`result/schema.json`、`result/summary.json`，最后更新 D1 为 `succeeded`。

- [ ] **Step 4: 实现 Queue 重试分类**

```ts
export async function consumeTaskMessage(message: Message<TaskMessage>, env: Bindings) {
  try {
    await executeTask(message.body.taskId, env)
    message.ack()
  } catch (error) {
    const taskError = toTaskError(error)
    // 只有明确标记为暂时性的基础设施错误才允许重试。
    if (taskError.retryable && message.attempts < 3) {
      message.retry()
      return
    }
    await markTaskFailed(message.body.taskId, taskError, env)
    message.ack()
  }
}
```

- [ ] **Step 5: 运行执行器测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/tasks`

Expected: PASS，覆盖 CSV、XLSX、类型错误、输出错误、重复消息、暂时重试和第三次失败。

- [ ] **Step 6: 提交**

```bash
git add apps/worker/src/features/tasks apps/worker/src/index.ts
git commit -m "feat(worker): execute versioned scripts from queue"
```

### Task 7: 完成分析推荐、确认和任务状态页面

**Files:**
- Create: `apps/web/src/features/analysis/AnalysisRequestPage.tsx`
- Create: `apps/web/src/features/analysis/PlanConfirmationPage.tsx`
- Create: `apps/web/src/features/tasks/TaskDetailPage.tsx`
- Create: `apps/web/src/features/analysis/PlanConfirmationPage.test.tsx`
- Modify: `apps/web/src/router.tsx`
- Create: `apps/worker/src/features/tasks/routes.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: 推荐、确认和任务 API。
- Produces: `/datasets/:versionId/analysis`、`/plans/:planId`、`/tasks/:taskId` 页面和 `GET /api/tasks/:id`。

- [ ] **Step 1: 写确认页关键信息测试**

```tsx
it('展示精确脚本版本、参数、理由和限制后才允许确认', () => {
  render(<PlanConfirmationPage plan={supportedPlan} />)
  expect(screen.getByText('sales-region-summary@1.0.0')).toBeVisible()
  expect(screen.getByText('字段结构和需求均符合该脚本能力')).toBeVisible()
  expect(screen.getByRole('button', { name: '确认并执行' })).toBeEnabled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/web test -- PlanConfirmationPage.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现三类页面**

需求页提供当前模板 Prompt 编辑框和本次需求输入框；如果 Prompt 内容发生变化，先调用计划 1 的 Prompt 版本接口创建新版本，再使用返回的精确版本 ID 创建执行计划。确认页展示脚本名称、精确版本、匹配理由、覆盖范围、限制、输入输出字段和 Schema 允许的参数控件；任务页每 2 秒轮询，进入 `succeeded` 或 `failed` 后停止。

不支持计划隐藏执行按钮并显示 `limitations`。参数控件只根据脚本参数 Schema 生成，不提供任意 JSON 编辑框。

- [ ] **Step 4: 运行计划 2 完整验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 全部退出码为 0；固定模型客户端使用测试替身，不产生真实 LLM 费用。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features apps/web/src/router.tsx apps/worker/src/features/tasks/routes.ts apps/worker/src/index.ts
git commit -m "feat(web): add analysis confirmation flow"
```

## 计划 2 验收结果

完成后，用户能够为已映射数据输入客制化需求，获得不包含实际数据行的单脚本推荐，查看并确认精确版本和参数，由 Queue 幂等执行完整脚本，并查看成功结果或明确失败原因。系统尚不生成或渲染报表。

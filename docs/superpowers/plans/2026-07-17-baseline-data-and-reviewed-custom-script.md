# 基础数据与审核型客制化脚本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以真实中文表头建立版本级映射，自动产出基础数据结果，并让用户审核 LLM 生成的候选脚本后再创建 PR。

**Architecture:** 模板保存 `sourceLabel`（原样表头）和英文 `name`；映射归属 `dataset_version_id`。映射确认后创建不依赖 LLM 的 baseline Queue 任务。客制化代码只生成草稿，用户点击后复用现有候选 PR 接口。

**Tech Stack:** React 19、Hono、D1、R2、Queues、Zod、Vitest、Testing Library、GitHub API。

## Global Constraints

- 禁止用旧 `description` 或缺失字段兜底；旧数据集重回 `inspected` 后重新映射。
- LLM 只接收字段清单、SDK 协议与用户需求，不接收数据行、R2 Key 或密钥。
- baseline 与脚本任务均使用流式 NDJSON，写入前校验结果 Schema。
- 草稿预览阶段不得调用 GitHub；仅用户明确点击后才创建 PR。

---

### Task 1: 替换字段协议并迁移版本级映射

**Files:**
- Modify: `packages/contracts/src/template.ts`
- Modify: `packages/contracts/src/dataset.ts`
- Create: `apps/worker/migrations/0004_version_mapping_and_baseline.sql`
- Test: `packages/contracts/src/template.test.ts`
- Test: `apps/worker/src/features/datasets/mapping-routes.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(FieldDefinitionSchema.safeParse({
  sourceLabel: '销售额', name: 'sales_amount', type: 'number', required: true,
}).success).toBe(true)
expect(FieldDefinitionSchema.safeParse({
  description: '销售额', name: 'sales_amount', type: 'number', required: true,
}).success).toBe(false)
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/contracts test -- src/template.test.ts`  
Expected: FAIL，`sourceLabel` 尚不存在。

- [ ] **Step 3: 实现协议与迁移**

```sql
UPDATE dataset_versions SET validation_status = 'inspected' WHERE validation_status = 'mapped';
DROP INDEX field_mappings_template_source_unique;
DROP INDEX field_mappings_template_target_unique;
DROP TABLE field_mappings;
CREATE TABLE field_mappings (
  id text PRIMARY KEY NOT NULL,
  dataset_version_id text NOT NULL,
  source_field text NOT NULL,
  target_field text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('string', 'number', 'boolean', 'date')),
  required integer NOT NULL CHECK (required IN (0, 1)),
  created_at text NOT NULL,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX field_mappings_version_source_unique ON field_mappings(dataset_version_id, source_field);
CREATE UNIQUE INDEX field_mappings_version_target_unique ON field_mappings(dataset_version_id, target_field);
```

将 `description` 替换为 `sourceLabel`；所有映射查询和写入使用 `dataset_version_id`。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/contracts test && pnpm --filter @data-analyze/worker test -- src/features/datasets`  
Expected: PASS，映射在两个数据集版本间隔离。

- [ ] **Step 5: 提交**

Run: `git add packages/contracts apps/worker/migrations/0004_version_mapping_and_baseline.sql && git commit -m "feat(data): scope mappings to dataset versions"`

### Task 2: 从真实表头生成模板字段和自动映射

**Files:**
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/worker/src/features/templates/routes.ts`
- Modify: `apps/web/src/features/templates/TemplateEditorPage.tsx`
- Modify: `apps/web/src/features/datasets/field-mapping.ts`
- Test: `apps/worker/src/features/llm/client.test.ts`
- Test: `apps/web/src/features/datasets/field-mapping.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
expect(await requestFieldDefinitions(inspection, llmEnv, '', fetcher)).toEqual([
  { sourceLabel: '销售额', name: 'sales_amount', type: 'number', required: true },
])
expect(createSuggestedTargets(['销售额'], fields)).toEqual({ 销售额: 'sales_amount' })
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/llm/client.test.ts && pnpm --filter @data-analyze/web test -- src/features/datasets/field-mapping.test.ts`  
Expected: FAIL，LLM 响应和自动映射仍使用 `description`。

- [ ] **Step 3: 实现原样标签规则**

```ts
const platformRules = [
  'sourceLabel 必须逐字复制自输入 sourceFields，禁止翻译、改写或遗漏。',
  '每项只返回 sourceLabel、name、type、required。',
  'name 为英文 snake_case；type 只能是 string、number、boolean、date。',
].join('\n')
```

Worker 校验 `sourceLabel` 与 `inspection.sourceFields` 一一对应；页面显示“原表头 / 英文键”；自动映射仅比较来源字段和 `sourceLabel`。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/llm/client.test.ts && pnpm --filter @data-analyze/web test -- src/features/templates/TemplateEditorPage.test.tsx src/features/datasets/field-mapping.test.ts`  
Expected: PASS，中文名称始终来自真实表头。

- [ ] **Step 5: 提交**

Run: `git add apps/worker/src/features/llm apps/worker/src/features/templates apps/web/src/features/templates apps/web/src/features/datasets && git commit -m "feat(templates): preserve source field labels"`

### Task 3: 加工页显示版本字段清单

**Files:**
- Modify: `apps/worker/src/features/plans/service.ts`
- Modify: `apps/worker/src/features/reports/service.ts`
- Modify: `apps/web/src/features/analysis/AnalysisRequestPage.tsx`
- Test: `apps/worker/src/features/plans/routes.test.ts`
- Test: `apps/web/src/features/analysis/AnalysisRequestPage.test.tsx`

- [ ] **Step 1: 写失败测试**

```ts
expect(await contextResponse.json()).toMatchObject({
  fields: [{ sourceLabel: '销售额', name: 'sales_amount', type: 'number' }],
})
```

```tsx
expect(screen.getByText('销售额 → sales_amount（number）')).toBeVisible()
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`  
Expected: FAIL，分析上下文不含字段列表。

- [ ] **Step 3: 实现版本上下文**

```ts
const mappings = await this.env.DB.prepare(
  'SELECT source_field, target_field, target_type FROM field_mappings WHERE dataset_version_id = ? ORDER BY source_field',
).bind(datasetVersionId).all<MappingRow>()
const fields = mappings.results.map((item) => ({
  sourceLabel: item.source_field, name: item.target_field, type: item.target_type,
}))
```

在两个 textarea 前渲染只读字段清单；报表上下文也用同一清单作为中文展示信息。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`  
Expected: PASS，字段清单可见且不包含数据行。

- [ ] **Step 5: 提交**

Run: `git add apps/worker/src/features/plans apps/worker/src/features/reports apps/web/src/features/analysis && git commit -m "feat(analysis): expose mapped version fields"`

### Task 4: 映射后自动产出基础数据结果

**Files:**
- Modify: `apps/worker/migrations/0004_version_mapping_and_baseline.sql`
- Modify: `apps/worker/src/features/datasets/routes.ts`
- Modify: `apps/worker/src/features/tasks/executor.ts`
- Test: `apps/worker/src/features/datasets/mapping-routes.test.ts`
- Test: `apps/worker/src/features/tasks/executor.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
await saveMapping(versionId)
expect(queue.messages).toHaveLength(1)
await executeTask(queue.messages[0].taskId, env)
expect(await env.DATA_BUCKET.get(resultKey)).not.toBeNull()
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/datasets/mapping-routes.test.ts src/features/tasks/executor.test.ts`  
Expected: FAIL，映射保存不创建 Queue 任务。

- [ ] **Step 3: 实现 baseline 任务**

迁移为 `execution_plans` 增加 `execution_mode text NOT NULL DEFAULT 'script' CHECK (execution_mode IN ('baseline', 'script'))`。映射保存事务插入 `baseline` 计划与任务并投递 Queue。

```ts
if (task.executionMode === 'baseline') {
  const output = createOutputWriter(env.DATA_BUCKET, temporaryKey, (record) => record as StandardRecord)
  for await (const record of normalizedInput()) await output.write(record)
  await output.close()
  return finalizeBaselineResult(output.rowCount, mappings)
}
```

`finalizeBaselineResult` 写入当前版本映射导出的 Schema 和 `{ rowCount, mode: 'baseline' }` 摘要；不调用 LLM 或注册表脚本。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/datasets/mapping-routes.test.ts src/features/tasks/executor.test.ts`  
Expected: PASS，结果使用英文键、基础任务无脚本依赖。

- [ ] **Step 5: 提交**

Run: `git add apps/worker/src/features/datasets apps/worker/src/features/tasks apps/worker/migrations/0004_version_mapping_and_baseline.sql && git commit -m "feat(tasks): materialize baseline data"`

### Task 5: 预览候选代码并显式创建 PR

**Files:**
- Create: `apps/worker/src/features/script-admin/generation.ts`
- Modify: `apps/worker/src/features/script-admin/routes.ts`
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/web/src/features/analysis/AnalysisRequestPage.tsx`
- Test: `apps/worker/src/features/script-admin/routes.test.ts`
- Test: `apps/web/src/features/analysis/AnalysisRequestPage.test.tsx`

- [ ] **Step 1: 写失败测试**

```ts
const draft = await authenticatedRequest('/internal/scripts/drafts', {
  method: 'POST', body: JSON.stringify({ datasetVersionId, requirement: '按区域汇总销售额' }),
}, env)
expect(draft.status).toBe(200)
expect(await draft.json()).toMatchObject({ id: expect.stringMatching(/^custom-/), version: '0.1.0' })
expect(createPullRequest).not.toHaveBeenCalled()
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/script-admin/routes.test.ts`  
Expected: FAIL，草稿路由不存在。

- [ ] **Step 3: 实现草稿和确认提交**

`generation.ts` 以 `custom-${crypto.randomUUID().replaceAll('-', '')}` 和 `0.1.0` 构造身份，调用 LLM 生成 SDK 脚本，并以 `ScriptUploadRequestSchema` 校验 metadata 与源码。草稿 API 仅返回 `{ id, version, source, rationale }`。

页面先显示只读代码块与说明；“创建候选 PR”按钮才调用既有 `/internal/scripts/candidates` 并显示其 PR 链接。

- [ ] **Step 4: 运行通过测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/script-admin && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`  
Expected: PASS，预览阶段没有 GitHub 请求，确认后只创建一个 PR。

- [ ] **Step 5: 完整验证与提交**

Run: `pnpm validate:scripts && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`  
Expected: 所有校验通过。

Run: `git add apps/worker/src/features/script-admin apps/worker/src/features/llm apps/web/src/features/analysis && git commit -m "feat(scripts): preview generated candidates"`

# 默认基础数据与显式脚本选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 映射完成后默认进入基础标准化任务；已发布脚本由用户显式选择，LLM 推荐仅为可选辅助；候选代码 502 可安全定位。

**Architecture:** 映射接口已返回 `baselineTaskId`，前端使用它进入任务页。加工页读取启用脚本元数据并创建精确脚本计划，不再要求自然语言需求；保留单独的“智能推荐”和“生成候选代码”入口。候选代码 LLM 客户端采用与既有字段/计划调用一致的安全日志，页面展示错误码与请求 ID。

**Tech Stack:** React 19、React Router、Hono、Cloudflare Workers、Vitest、Testing Library。

## Global Constraints

- 默认基础任务不调用 LLM，且用户无需填写客制化需求。
- LLM 不记录 Prompt、字段值、原始数据、模型原文或任何密钥。
- 保留当前未提交的脚本决策日志改动，不回退或覆盖。
- 字段不增加兜底值；接口返回值与错误码显式建模。

---

### Task 1: 让映射后的默认去向成为基础任务

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/datasets/FieldMappingPage.tsx`
- Test: `apps/web/src/features/datasets/FieldMappingPage.test.tsx`

**Produces:** `saveFieldMapping` 返回 `baselineTaskId`；路由页面跳转 `/tasks/:baselineTaskId`。

- [ ] **Step 1: 写失败测试**

```tsx
expect(mockNavigate).toHaveBeenCalledWith('/tasks/baseline-task-id')
```

- [ ] **Step 2: 运行测试，确认因仍跳转分析页而失败**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/FieldMappingPage.test.tsx`

- [ ] **Step 3: 最小实现**

```ts
export type FieldMappingSaveResult = {
  status: 'mapped'
  mappingCount: number
  baselineTaskId: string
}
```

```tsx
const result = await saveFieldMapping(versionId, mappings)
navigate(`/tasks/${result.baselineTaskId}`)
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @data-analyze/web test -- src/features/datasets/FieldMappingPage.test.tsx`

### Task 2: 将已启用脚本改为显式选择，保留推荐为可选操作

**Files:**
- Modify: `apps/worker/src/features/plans/service.ts`
- Modify: `apps/worker/src/features/plans/routes.ts`
- Modify: `apps/web/src/features/analysis/AnalysisRequestPage.tsx`
- Test: `apps/worker/src/features/plans/routes.test.ts`
- Test: `apps/web/src/features/analysis/AnalysisRequestPage.test.tsx`

**Produces:** 分析上下文返回启用脚本元数据；选择精确 `scriptId@version` 后创建无需 LLM 的执行计划；智能推荐继续使用既有 plans 创建接口。

- [ ] **Step 1: 写失败测试**

```ts
expect(context.scripts).toEqual([expect.objectContaining({ id: 'sales-region-summary', version: '1.0.0' })])
```

```tsx
expect(screen.getByRole('button', { name: '按区域汇总销售额' })).toBeVisible()
expect(screen.getByLabelText('本次客制化加工需求')).not.toBeRequired()
```

- [ ] **Step 2: 运行测试，确认因上下文没有脚本和输入必填而失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`

- [ ] **Step 3: 最小实现**

```ts
scripts: availableScripts
```

页面将“已启用脚本”渲染为可选卡片，点击后调用新建的精确计划接口；“智能推荐”折叠为可选操作，并且仅在填写需求后可用。

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm --filter @data-analyze/worker test -- src/features/plans/routes.test.ts && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`

### Task 3: 记录并展示候选代码生成失败的可定位信息

**Files:**
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/web/src/features/analysis/AnalysisRequestPage.tsx`
- Test: `apps/worker/src/features/llm/client.test.ts`
- Test: `apps/web/src/features/analysis/AnalysisRequestPage.test.tsx`

**Produces:** 候选代码失败日志仅含错误码、上游状态和耗时；页面展示 API `code` 和 `requestId`。

- [ ] **Step 1: 写失败测试**

```ts
expect(logger.error).toHaveBeenCalledWith(
  'LLM 候选代码状态异常',
  expect.objectContaining({ errorCode: 'LLM_REQUEST_FAILED', upstreamStatus: 429 }),
)
```

```tsx
expect(screen.getByText('LLM_REQUEST_FAILED：候选代码生成失败（请求 ID：request-1）')).toBeVisible()
```

- [ ] **Step 2: 运行测试，确认因无日志和通用页面提示而失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/llm/client.test.ts && pnpm --filter @data-analyze/web test -- src/features/analysis/AnalysisRequestPage.test.tsx`

- [ ] **Step 3: 最小实现**

候选代码调用增加 `logger`、计时、超时、非 2xx 与协议失败日志；前端复用 `ApiError.payload` 提取 `code` 与 `requestId`，只展示安全标识。

- [ ] **Step 4: 运行定向与完整验证**

Run: `pnpm validate:scripts && pnpm typecheck && pnpm test && pnpm build`


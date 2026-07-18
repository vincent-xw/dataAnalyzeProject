# 数据资产分析历史 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可以针对一个数据资产创建自然语言分析、查看历史规则并重新渲染图表。

**Architecture:** 使用独立 `analyses` 控制面表保存绑定资产的不可变 `ReportConfig` 快照。Worker 从 R2 读取 schema、统计与受限数据行，LLM 仅生成并校验规则；Web 以 ECharts 和轻量组件按快照渲染。

**Tech Stack:** Cloudflare Worker、D1、R2、Hono、Zod、React 19、React Router、ECharts、Vitest。

## Global Constraints

- 不恢复模板、数据集、任务、报表或脚本旧链路。
- `ReportConfig` 必须通过 `@data-analyze/report-schema` 的结构、字段和容量校验。
- 模型不得接收完整数据行；分析记录不复制 R2 数据。
- 跨资产读取分析记录必须返回 404。

---

### Task 1: 分析记录存储与 Worker API

**Files:**
- Create: `apps/worker/migrations/0007_asset_analyses.sql`
- Create: `apps/worker/src/features/analyses/service.ts`
- Create: `apps/worker/src/features/analyses/routes.ts`
- Create: `apps/worker/src/features/analyses/routes.test.ts`
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Produces `POST /api/assets/:assetId/analyses`, `GET /api/assets/:assetId/analyses`, `GET /api/assets/:assetId/analyses/:analysisId`.
- Produces `requestAssetAnalysisConfig(context, bindings)` returning `ReportConfig`.

- [ ] **Step 1: Write failing Worker route tests**

```ts
it('creates a validated analysis and lists it for its asset', async () => {
  const response = await authenticatedRequest(`/api/assets/${assetId}/analyses`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requirement: '按姓名展示总成绩' }),
  }, env)
  expect(response.status).toBe(201)
  expect((await authenticatedRequest(`/api/assets/${assetId}/analyses`, {}, env)).status).toBe(200)
})
```

- [ ] **Step 2: Run the Worker test and verify it fails because the route is absent**

Run: `pnpm --filter @data-analyze/worker test -- src/features/analyses/routes.test.ts`

- [ ] **Step 3: Add migration, service, LLM protocol and routes**

```sql
CREATE TABLE analyses (
  id text PRIMARY KEY NOT NULL,
  asset_id text NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
  requirement text NOT NULL,
  title text,
  config_json text,
  status text NOT NULL CHECK (status IN ('ready', 'failed')),
  failure_reason text,
  created_by text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX analyses_asset_created_at_idx ON analyses(asset_id, created_at DESC);
```

- [ ] **Step 4: Run Worker tests and typecheck**

Run: `pnpm --filter @data-analyze/worker test -- src/features/analyses/routes.test.ts && pnpm --filter @data-analyze/worker typecheck`

### Task 2: 分析历史和图表页面

**Files:**
- Create: `apps/web/src/features/analyses/AnalysisListPage.tsx`
- Create: `apps/web/src/features/analyses/AnalysisDetailPage.tsx`
- Create: `apps/web/src/features/analyses/AnalysisChart.tsx`
- Create: `apps/web/src/features/analyses/AnalysisListPage.test.tsx`
- Create: `apps/web/src/features/analyses/AnalysisDetailPage.test.tsx`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/assets/AssetDetailPage.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes Worker analysis summary and detail endpoints.
- Produces routes `/assets/:assetId/analyses` and `/assets/:assetId/analyses/:analysisId`.

- [ ] **Step 1: Write failing component tests for entry, creation, history and detail rendering**

```tsx
expect(await screen.findByRole('link', { name: '数据分析' })).toHaveAttribute('href', '/assets/asset-1/analyses')
fireEvent.change(screen.getByLabelText('分析需求'), { target: { value: '按姓名展示总成绩' } })
fireEvent.click(screen.getByRole('button', { name: '创建分析' }))
expect(apiRequest).toHaveBeenCalledWith('/api/assets/asset-1/analyses', expect.objectContaining({ method: 'POST' }))
```

- [ ] **Step 2: Run Web tests and verify they fail because the pages do not exist**

Run: `pnpm --filter @data-analyze/web test -- src/features/analyses/AnalysisListPage.test.tsx src/features/analyses/AnalysisDetailPage.test.tsx`

- [ ] **Step 3: Implement typed API client, pages, router and ECharts renderer**

```tsx
{ path: 'assets/:assetId/analyses', element: <AnalysisListPage /> },
{ path: 'assets/:assetId/analyses/:analysisId', element: <AnalysisDetailPage /> },
```

- [ ] **Step 4: Run focused Web tests and typecheck**

Run: `pnpm --filter @data-analyze/web test -- src/features/analyses && pnpm --filter @data-analyze/web typecheck`

### Task 3: End-to-end verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-asset-analysis-history.md` (check tasks)

- [ ] **Step 1: Run complete validation**

Run: `pnpm validate:scripts && pnpm typecheck && pnpm test && pnpm build`

- [ ] **Step 2: Inspect the diff and commit**

Run: `git diff --check && git status --short && git add apps/worker apps/web packages/report-schema docs/superpowers/specs/2026-07-18-asset-analysis-history-design.md && git commit -m "feat(analysis): add asset analysis history"`

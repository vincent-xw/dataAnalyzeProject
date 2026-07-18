# 分析选表预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建分析时为每张已选数据表展示列名和前十行参考数据。

**Architecture:** `AnalysisListPage` 在选中表变化后调用现有资产预览 API，把每张表的请求状态和预览结果保存在页面状态中。创建请求不携带预览行。

**Tech Stack:** React 19、Vitest、现有 `/api/assets/:id/preview` API。

## Global Constraints

- 不新增 Worker 路由、数据库迁移或模型输入数据。
- 每张表仅渲染十行，加载失败不影响其他表和创建表单。

---

### Task 1: 选表预览

**Files:**
- Modify: `apps/web/src/features/analyses/AnalysisListPage.tsx`
- Modify: `apps/web/src/features/analyses/AnalysisListPage.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
expect(apiRequest).toHaveBeenCalledWith('/api/assets/a/preview')
expect(await screen.findByText('张三')).toBeInTheDocument()
```

- [ ] **Step 2: 实现选择触发的预览请求和前十行表格**

```tsx
apiRequest<DataAssetPreview>(`/api/assets/${assetId}/preview`)
```

- [ ] **Step 3: 验证并提交**

Run: `pnpm --filter @data-analyze/web test -- src/features/analyses && pnpm --filter @data-analyze/web typecheck && pnpm --filter @data-analyze/web build`

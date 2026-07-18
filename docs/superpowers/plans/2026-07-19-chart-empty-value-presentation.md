# 图表空值与统计信息展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将空分组统一显示为“空值”，并为图表提供固定 legend、数据标签与 tooltip。

**Architecture:** 前端 `buildChartOption` 在聚合前标准化维度/系列值；ECharts option 根据饼图或多系列笛卡尔图提供固定展示配置。新增 D1 默认提示词版本，但不把渲染属性交给 LLM 输出。

**Tech Stack:** React、ECharts、Vitest、Cloudflare D1。

## Global Constraints

- 空字符串、空白字符、`-`、null、undefined 均映射为“空值”并参与统计。
- tooltip、legend、标签是渲染器默认行为，不增加 ReportConfig 协议字段。
- 仅新建分析使用新版提示词。

---

### Task 1: 图表聚合与展示

**Files:**
- Modify: `apps/web/src/features/analyses/AnalysisChart.tsx`
- Modify: `apps/web/src/features/analyses/AnalysisChart.test.tsx`

- [ ] 编写失败测试，断言空维度聚合为“空值”，饼图含 legend/label/tooltip，含 series 的折线图含 legend/tooltip。
- [ ] 运行 `pnpm --filter @data-analyze/web test -- AnalysisChart.test.tsx`，确认失败。
- [ ] 实现空值标准化和 ECharts 展示 option。
- [ ] 重跑目标测试，确认通过。

### Task 2: 新版默认提示词与远程迁移

**Files:**
- Create: `apps/worker/migrations/0012_chart_empty_values_prompt.sql`

- [ ] 写入版本 3 默认提示词，保留 count/series 规则，声明空分组按“空值”语义统计、渲染器自动提供 tooltip/legend。
- [ ] 执行远程 D1 migration。
- [ ] 执行 Web typecheck/build 与 `git diff --check`。

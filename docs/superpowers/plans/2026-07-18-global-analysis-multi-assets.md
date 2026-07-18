# 全局多数据表分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据分析提升为顶层入口，并让一条分析关联一张主表和多张参考表。

**Architecture:** 迁移以关联表取代 `analyses.asset_id`；Worker 提供全局列表、按资产集合创建和详情读取接口；Web 在顶层页面选表、指定主表、展示历史与图表。

### Task 1: 迁移和 Worker API
- [ ] 写失败测试：创建时接受 `assetIds` 与 `primaryAssetId`，全局列表返回关联资产。
- [ ] 创建 migration 回填旧资产为 `primary` 关联，重建 `analyses` 并新增 `analysis_data_assets`。
- [ ] 修改分析服务、LLM 上下文和路由；删除资产内分析路由。
- [ ] 运行 Worker 测试和类型检查。

### Task 2: 顶层分析页面
- [ ] 新建顶层导航、全局列表、新建表单与详情页关联表展示。
- [ ] 删除资产详情分析入口和资产内路由。
- [ ] 运行 Web 类型检查、关键测试与构建。

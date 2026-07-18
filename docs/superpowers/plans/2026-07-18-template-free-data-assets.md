# 无模板数据资产 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从首页直接导入一个 CSV/XLSX 工作表为可预览、可编辑元数据的 R2 NDJSON 资产，并移除旧模板驱动链路与测试数据。

**Architecture:** 新建资产上传 API 负责原始文件、单工作表解析、NDJSON、Schema、预览和控制面记录。`data_assets` 成为唯一数据入口且不再关联模板；旧数据集、模板、任务、报告和脚本发布路由从应用与前端移除。

### Task 1: 破坏性资产模型迁移
- [ ] 创建 D1 migration，重建 `data_assets` 去除 `template_id`，清空旧控制面表；更新 Drizzle schema、资产服务和 API 类型；删除旧 R2 前缀的管理命令。

### Task 2: 无模板资产上传
- [ ] 先写 Worker 路由测试：CSV 创建资产、XLSX 等待并选择工作表、失败时无残留记录。
- [ ] 实现 `/api/assets/upload`：接收文件和格式参数，写入 `assets/<id>/source`、`data/data.ndjson`、`schema.json`、`preview.json` 并创建资产。

### Task 3: 首页上传与资产管理
- [ ] 先写前端测试：资产列表上传入口、XLSX 工作表选择、成功跳转详情。
- [ ] 新建资产上传页；资产列表显示无模板资产；详情页继续维护元数据和预览。

### Task 4: 删除旧链路
- [ ] 从路由、导航和 Worker 应用移除模板、数据集映射、计划、任务、报告与脚本发布入口及其测试；更新所有残留类型引用。

### Task 5: 验证与数据清理
- [ ] 对本地 D1 应用 migration，执行旧 R2 前缀删除；运行范围测试、类型检查、构建和 E2E，记录结果。

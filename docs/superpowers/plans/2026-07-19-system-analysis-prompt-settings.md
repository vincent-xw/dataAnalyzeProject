# 系统分析提示词设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让分析系统提示词可版本化编辑、恢复默认并由分析记录追溯。

**Architecture:** D1 保存追加式版本及当前版本指针；Worker 提供设置 API 和分析时的当前内容读取；Web 设置页管理版本。

### Task 1: D1 与 Worker
- [ ] 建立系统提示词版本与设置表，给分析记录增加 `prompt_version_id`。
- [ ] 写设置 API：读取当前、保存版本、历史列表、切换、恢复默认。
- [ ] 分析创建读取当前版本并持久化使用版本。

### Task 2: 系统设置页面
- [ ] 添加顶层“系统设置”导航与提示词编辑、历史、恢复默认页面。
- [ ] 运行关键测试、类型检查和构建。

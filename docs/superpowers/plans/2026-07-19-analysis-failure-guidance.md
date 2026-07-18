# 分析失败诊断与提示词重试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对可修复的分析失败提供 LLM 诊断、提示词改写和手动重试，并准确区分服务故障。

**Architecture:** 规则生成、规则校验和 D1 持久化拆为独立阶段。仅规则/需求阶段进入诊断 LLM；D1 写入错误返回 5xx 且不尝试二次落库。失败分析持久化诊断建议，前端从历史记录或当前失败响应中应用改写需求。

**Tech Stack:** Hono、Cloudflare D1、Zod、React 19、Vitest、Testing Library。

## Global Constraints

- LLM 诊断不得用于 D1、网络或模型可用性错误。
- 敏感诊断日志仅在 `ENVIRONMENT=development` 且 `LOG_SENSITIVE_DEBUG=true` 时输出，并沿用现有脱敏逻辑。
- 诊断失败不得覆盖原始错误或阻断失败记录保存。
- 用户点击应用建议后必须手动提交，禁止自动重试。

---

### Task 1: 持久化诊断建议与失败分类

**Files:**
- Create: `apps/worker/migrations/0010_analysis_failure_guidance.sql`
- Modify: `apps/worker/src/features/analyses/service.ts`
- Modify: `apps/worker/src/features/analyses/routes.test.ts`

**Interfaces:**
- Produces `FailureGuidance = { summary: string; suggestion: string; revisedRequirement: string }`。
- `AnalysisService.create(..., failureGuidance?: FailureGuidance | null)` 将诊断 JSON 保存并在详情中返回 `guidance`。

- [ ] 编写迁移与服务失败测试，断言失败分析详情包含 `guidance`。
- [ ] 执行 Worker 测试，确认新增测试先失败。
- [ ] 增加 D1 可空 `failure_guidance_json` 字段，并在服务中安全解析/序列化该字段。
- [ ] 重新执行测试并提交 `feat(worker): persist analysis failure guidance`。

### Task 2: 规则诊断与阶段化错误处理

**Files:**
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/worker/src/features/analyses/routes.ts`
- Modify: `apps/worker/src/features/analyses/routes.test.ts`

**Interfaces:**
- Produces `requestAnalysisFailureGuidance(input, bindings, ...) => Promise<FailureGuidance>`。
- API 规则错误返回 `{ code: 'ANALYSIS_CONFIG_INVALID', message, analysisId?, guidance? }`；D1 错误返回 `{ code: 'D1_WRITE_FAILED', message }` 与 HTTP 503。

- [ ] 编写失败测试：规则失败得到 guidance；诊断失败保留原始 422；D1 保存失败返回 503 并不写第二条失败记录。
- [ ] 运行目标测试确认失败。
- [ ] 添加严格 Zod 诊断响应协议和独立系统提示词；拆分规则生成/校验、失败记录写入和成功持久化的 try/catch。
- [ ] 为 D1 主插入、资产关联、回读和诊断调用记录阶段日志。
- [ ] 重新运行目标测试并提交 `feat(worker): guide recoverable analysis failures`。

### Task 3: 前端展示、应用建议与手动重试

**Files:**
- Modify: `apps/web/src/features/analyses/AnalysisPage.tsx`（按实际组件路径调整）
- Modify: `apps/web/src/features/analyses/*.test.tsx`

**Interfaces:**
- 消费分析响应的 `guidance`。
- “应用建议”将 `guidance.revisedRequirement` 放入创建表单，不发出请求；用户提交时才创建分析。

- [ ] 编写组件测试：失败建议可见，点击应用建议更新需求输入但不调用创建 API。
- [ ] 运行组件测试确认失败。
- [ ] 实现失败卡片和历史失败详情的摘要、建议、应用建议按钮。
- [ ] 重新运行组件测试并提交 `feat(web): apply analysis failure guidance`。

### Task 4: 部署数据库迁移与验证

**Files:**
- Modify: none

- [ ] 执行 `pnpm --filter @data-analyze/worker exec wrangler d1 migrations apply data-analyze-db --remote`。
- [ ] 执行 `pnpm --filter @data-analyze/worker typecheck`、目标 Worker 测试、`pnpm --filter @data-analyze/web typecheck` 与前端构建。
- [ ] 检查 `git diff --check` 与工作区状态。
- [ ] 提交剩余验证相关修改（如有）。

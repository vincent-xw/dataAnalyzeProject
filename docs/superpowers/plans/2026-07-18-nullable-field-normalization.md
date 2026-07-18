# 可空字段标准化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让所有标准字段受控转换非空值、可选字段保留 `null`、必填字段报告带行号的缺失错误。

**Architecture:** 将 `null` 纳入共享 `StandardValue`，由标准化器统一识别空值与类型转换；执行器把行号传给标准化器。脚本和报表通过更新的共享类型自然接收 `null`。

**Tech Stack:** TypeScript、Zod、Cloudflare Worker、Vitest、script-sdk。

## Global Constraints

- 缺失值不得被替换为零、空字符串、当前日期或任何业务默认值。
- 必填字段缺失使用非重试 `FIELD_REQUIRED`；非空非法值使用 `FIELD_TYPE_MISMATCH`。
- 转换仅接受设计说明定义的格式白名单。

---

### Task 1: 扩展可空标准记录协议

**Files:**
- Modify: `packages/script-sdk/src/index.ts`
- Modify: `packages/script-sdk` 下受 `StandardValue` 影响的测试

- [ ] **Step 1: 写失败的 null 标准记录类型测试**

增加一个脚本 SDK 测试，用 `const record: StandardRecord = { approvedAt: null }` 通过类型检查。

- [ ] **Step 2: 运行类型检查确认失败**

Run: `pnpm --filter @data-analyze/script-sdk typecheck`

Expected: `null` 不可赋给 `StandardValue`。

- [ ] **Step 3: 扩展协议类型**

```ts
export type StandardValue = string | number | boolean | null
```

- [ ] **Step 4: 运行 SDK 类型检查并提交**

Run: `pnpm --filter @data-analyze/script-sdk typecheck`

Expected: PASS。

### Task 2: 实现受控可空标准化

**Files:**
- Modify: `apps/worker/src/features/tasks/normalize.ts`
- Modify: `apps/worker/src/features/tasks/executor.ts`
- Modify: `apps/worker/src/features/tasks/executor.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖四个类型的可选空值返回 `null`、必填空值抛出带行号的 `FIELD_REQUIRED`、number/boolean/date 的白名单转换以及非法非空值的 `FIELD_TYPE_MISMATCH`。

- [ ] **Step 2: 运行范围测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/tasks/executor.test.ts`

Expected: 新用例失败。

- [ ] **Step 3: 最小实现**

为 `RuntimeFieldMapping` 增加 `required`；`normalizeValue` 接收行号与 required，空值先处理。日期解析接受斜杠、ISO 时间和 Excel 序列号后输出 `YYYY-MM-DD`；布尔只接受白名单；错误消息带字段与行号。

- [ ] **Step 4: 运行范围测试并提交**

Run: `pnpm --filter @data-analyze/worker test -- src/features/tasks/executor.test.ts`

Expected: PASS。

### Task 3: 下游 null 兼容与整体验证

**Files:**
- Modify: 仅因 `StandardValue` 扩展而产生编译错误的脚本、报表或输出代码。
- Test: 对应受影响测试。

- [ ] **Step 1: 运行受影响包的类型检查和测试**

Run: `pnpm --filter @data-analyze/script-sdk typecheck && pnpm --filter @data-analyze/worker test`

Expected: PASS，或仅出现与本次无关的既有失败。

- [ ] **Step 2: 执行仓库级验证**

Run: `pnpm typecheck && pnpm test && pnpm build`

Expected: 记录并区分本次回归与既有失败。

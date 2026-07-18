# 仓库指南

## 项目结构与模块组织

这是一个面向单用户的 Cloudflare 数据分析产品 pnpm workspace。

- `apps/web/`：React 19 + Vite 前端。页面功能及其测试放在 `src/features/<feature>/` 中。
- `apps/worker/`：Hono API、Queue 消费者、D1 Schema/Migration、R2 集成与 Worker 测试。接口业务放在 `src/features/`，共享中间件放在 `src/middleware/`。
- `packages/contracts/`：共享 Zod 协议；`packages/script-sdk/` 与 `packages/scripts/`：静态部署的分析脚本及注册表；`packages/report-schema/`：受限报表配置协议。
- `tests/e2e/`：Playwright 端到端场景及测试数据；`docs/runbooks/`：部署与故障恢复说明。

## 构建、测试与开发命令

使用 Node `24.18.0` 和 pnpm `11.9.0`（先启用 Corepack）。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile  # 按 lockfile 安装依赖
pnpm --filter @data-analyze/web dev  # 启动 Vite 前端
pnpm --filter @data-analyze/worker dev  # 启动本地 Worker
pnpm dev:worker  # 初始化本地 D1、脚本目录并启动可手工联调的 Worker
pnpm dev:web  # 启动带本地开发认证代理的 Vite 前端
pnpm validate:scripts  # 校验静态脚本注册表
pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e  # 启动本地服务、应用 D1 Migration 并运行 Playwright
```

## 代码风格与命名约定

使用 TypeScript ESM、严格类型与两空格缩进。引号和分号遵循同目录既有代码；当前未配置格式化或 lint 工具。React 组件使用 `PascalCase`，工具函数使用 `camelCase`，功能目录使用小写 kebab-case（如 `features/script-admin/`）。测试与实现文件相邻，命名为 `*.test.ts` 或 `*.test.tsx`。非直观的函数、变量及业务逻辑添加简洁中文注释；除非需求明确说明原因，不要为字段增加兜底值。

## 测试要求

单元与组件测试使用 Vitest，前端交互使用 Testing Library，Worker 行为使用 Cloudflare Vitest pool。除成功路径外，覆盖协议、错误路径和字段映射校验。涉及完整流程的改动，在提审前运行 CI 等价命令：`pnpm validate:scripts`、`pnpm typecheck`、`pnpm test`、`pnpm build` 与 `pnpm test:e2e`。

## 提交与拉取请求规范

提交标题遵循现有 Conventional Commit 风格：`feat(worker): ...`、`fix(scripts): ...`、`test(e2e): ...` 或 `docs: ...`。每个提交保持单一、明确的改动范围。拉取请求应说明用户可见或 API 影响、列出已执行命令、关联相关问题；涉及 UI 时附截图。严禁提交 Cloudflare、GitHub、Access 或 LLM 密钥；通过 Worker 或 GitHub Actions Secret 配置，部署变更请参考 `docs/runbooks/`。

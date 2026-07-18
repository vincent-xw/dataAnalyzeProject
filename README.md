# 数据分析 Agent

面向固定 CSV/XLSX 数据源的单用户分析系统。用户创建可修改的加工与报表 Prompt，显式映射字段，由 LLM 在构建期脚本注册表中选择精确版本；Worker 执行脚本后将结果写入 R2，并用受限报表协议渲染固定 React/ECharts 组件。

## 系统边界

- Web：React + Vite，部署到 Cloudflare Pages。
- API/执行：Hono Worker、Cloudflare Queue。
- 结构化索引：D1；原始文件、中间结果、报表数据：R2。
- Secret：只保存在 Worker Secret 或 GitHub Actions Secret。
- 身份：除 `/health` 外，`/api/*` 与 `/internal/*` 强制校验 Cloudflare Access JWT。
- 脚本：隐藏页面 `/internal/scripts` 只创建候选 Pull Request；CI、人工合并、重新部署和目录同步后才可用于新任务。

不包含多租户、运行时动态代码沙箱、自动合并、自动字段猜测和完整导出功能。

## 本地验证

要求 Node.js `24.18.0`、pnpm `11.9.0`。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate:scripts
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` 会应用本地 D1 Migration，启动 Wrangler、Vite 和 Chromium，并使用测试专用私钥签发完整 JWT。测试模式仍校验签名、issuer、audience 和邮箱，不存在认证旁路；固定 LLM 响应也只在 `ENVIRONMENT=test` 时启用。

## 本地开发

复制 `apps/worker/.dev.vars.example` 为 `apps/worker/.dev.vars`，填写本地联调所需的 `LLM_API_KEY`；若要调试候选脚本 PR，再填写 `GITHUB_TOKEN`。随后在两个终端分别执行：

```bash
pnpm dev:worker
pnpm dev:web
```

`pnpm dev:worker` 会使用 `.wrangler/dev-state` 初始化本地 D1 和脚本目录，并以 `ENVIRONMENT=development` 启动 Worker。Vite 代理只在该环境向本地 Worker 注入固定开发身份；生产环境与测试环境仍强制执行原有 Access JWT 校验。

## 主要流程

1. 创建分析模板和标准字段，保存加工/报表 Prompt 版本。
2. 上传 CSV/XLSX 到 R2，选择编码、分隔符或工作表。
3. 用户显式映射来源字段，必填字段缺失时禁止继续。
4. LLM 只读取结构、Prompt 和脚本 metadata，返回精确脚本及参数或明确拒绝。
5. 用户确认后 Queue 执行静态脚本，结果与 Schema 写入 R2，状态写入 D1。
6. LLM 只基于结果 Schema 生成受限报表配置，前端用固定组件预览并发布。

部署、Access、Bindings 与 Secret 配置见 [Cloudflare 部署手册](docs/runbooks/cloudflare-deployment.md)，故障处理见 [恢复手册](docs/runbooks/incident-recovery.md)。

# Cloudflare 部署操作手册

## 1. 前置约定

准备一个 Cloudflare Zone 和一个应用域名，例如 `analytics.example.com`。Pages 承载页面；同一域名下的以下精确路径由 Worker Route 接管：

- `analytics.example.com/api/*`
- `analytics.example.com/internal/scripts/candidates`
- `analytics.example.com/internal/scripts/sync`
- `analytics.example.com/health`

不要将 `analytics.example.com/internal/*` 整体路由到 Worker，否则隐藏页面 `/internal/scripts` 会被 Worker 截获。隐藏路径不是安全边界，整个域名仍由 Cloudflare Access 保护。`workers_dev` 已关闭，禁止通过 `workers.dev` 绕过 Access。

## 2. 创建 Cloudflare 资源

从仓库根目录执行固定版本 Wrangler：

```bash
pnpm --filter @data-analyze/worker exec wrangler d1 create data-analyze-db
pnpm --filter @data-analyze/worker exec wrangler r2 bucket create data-analyze-data
pnpm --filter @data-analyze/worker exec wrangler queues create data-analyze-tasks
```

将 D1 返回的真实 `database_id` 写入 `apps/worker/wrangler.jsonc`。确认 D1、R2、Queue 的 Binding 名分别为 `DB`、`DATA_BUCKET`、`TASK_QUEUE`，Queue 同时配置 producer 和 consumer。

将以下非敏感变量替换为真实值：

- `LLM_BASE_URL`、`LLM_MODEL`
- `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`
- `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BASE_BRANCH`
- `ENVIRONMENT=production`

生产环境不配置 `ACCESS_TEST_PUBLIC_JWK`。该 Binding 只由本地 E2E 启动器注入，并且仅在 `ENVIRONMENT=test` 时读取。

## 3. 写入 Worker Secret

Secret 不进入 `.dev.vars.example`、Git、D1、R2 或日志：

```bash
pnpm --filter @data-analyze/worker exec wrangler secret put LLM_API_KEY
pnpm --filter @data-analyze/worker exec wrangler secret put GITHUB_TOKEN
```

GitHub Token 只授予目标仓库读取内容、创建分支、写入内容和创建 Pull Request 所需的最小权限，不授予自动合并权限。

## 4. 配置 Access 与路由

1. 创建 Pages 项目并绑定 `analytics.example.com`。
2. 在 Zone 中添加上文四条 Worker Route，目标为 `data-analyze-worker`。
3. 创建 Cloudflare Access Self-hosted Application，覆盖 `analytics.example.com/*`，只允许可信用户邮箱。
4. Access 的 Application Audience 写入 `CF_ACCESS_AUD`，Team Domain 写入 `CF_ACCESS_TEAM_DOMAIN`。
5. 为部署同步创建 Access Service Token，并让同一 Access Application 的 Service Auth Policy 允许它。
6. 确认 Worker 设置中的 `workers.dev` 为关闭状态。

Access 在边缘验证浏览器 Cookie/Service Token，并向 Worker 注入 `Cf-Access-Jwt-Assertion`；Worker 会再次验证签名、issuer、audience 和邮箱。

## 5. 首次迁移与部署

先执行完整验证，再迁移和部署：

```bash
pnpm validate:scripts
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @data-analyze/worker exec wrangler d1 migrations apply data-analyze-db --remote
pnpm --filter @data-analyze/worker exec wrangler deploy
pnpm --filter @data-analyze/web build
pnpm --filter @data-analyze/worker exec wrangler pages deploy ../../apps/web/dist --project-name data-analyze-pages
```

部署 Worker 后，通过 Access Service Token 同步构建期脚本目录：

```bash
curl --fail-with-body --request POST "https://analytics.example.com/internal/scripts/sync" \
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

同步使用单个 D1 batch：先禁用旧索引，再启用当前构建产物版本；历史记录不会删除。同步失败时新脚本不可见，旧 Worker 与历史任务仍可读取已有版本。

## 6. GitHub Actions 配置

Repository Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Repository Variables：

- `CF_PAGES_PROJECT`
- `WORKER_BASE_URL`，例如 `https://analytics.example.com`

Cloudflare API Token 只授予目标账号的 Worker、D1、R2、Queue、Pages 部署权限。`main` 部署任务按 Migration、Worker、Pages、目录同步的顺序执行；任一步失败都会使 Workflow 失败。

## 7. 上线验收

1. 未登录访问页面应进入 Access 登录；未携带 JWT 直接调用 `/api/templates` 应返回 401。
2. `GET /health` 返回 `{"status":"ok"}`。
3. 登录后创建模板、上传一份小型 CSV、显式映射字段并完成一次加工。
4. 确认任务成功后生成、预览和发布报表。
5. 直接输入 `/internal/scripts` 可打开候选脚本页，主导航中不应出现该入口。
6. 候选脚本只能产生 PR，不能在页面自动合并；合并和部署后执行 `/internal/scripts/sync` 才能用于新任务。

## 8. Secret 轮换

重新执行对应的 `wrangler secret put` 即可原地更新 Worker Secret。轮换 LLM Key 后执行一次脚本推荐和报表生成；轮换 GitHub Token 后创建一个测试候选 PR。Access Service Token 在 Cloudflare 和 GitHub Actions 中同步替换，旧 Token 随即吊销。

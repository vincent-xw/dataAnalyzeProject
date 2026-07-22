# Cloudflare 部署操作手册

## 1. 前置约定

准备一个 Cloudflare Zone 和一个应用域名，例如 `analytics.example.com`。Pages 承载页面；同一域名下的以下路径由 Worker Route 接管：

- `analytics.example.com/api/*`
- `analytics.example.com/health`

整个域名由 Cloudflare Access 保护；`workers_dev` 已关闭，禁止通过 `workers.dev` 绕过 Access。

## 2. 创建 Cloudflare 资源

从仓库根目录执行固定版本 Wrangler：

```bash
pnpm --filter @data-analyze/worker exec wrangler d1 create data-analyze-db
pnpm --filter @data-analyze/worker exec wrangler r2 bucket create data-analyze-data
```

将 D1 返回的真实 `database_id` 写入 `apps/worker/wrangler.jsonc`。确认 D1、R2 的 Binding 名分别为 `DB`、`DATA_BUCKET`。

将以下非敏感变量替换为真实值：

- `LLM_BASE_URL`、`LLM_MODEL`
- `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`
- `ENVIRONMENT=production`

生产环境不配置 `ACCESS_TEST_PUBLIC_JWK`。该 Binding 只由本地 E2E 启动器注入，并且仅在 `ENVIRONMENT=test` 时读取。

## 3. 写入 Worker Secret

Secret 不进入 `.dev.vars.example`、Git、D1、R2 或日志：

```bash
pnpm --filter @data-analyze/worker exec wrangler secret put LLM_API_KEY
```

## 4. 配置 Access 与路由

1. 创建 Pages 项目并绑定 `analytics.example.com`。
2. 在 Zone 中添加上文两条 Worker Route，目标为 `data-analyze-worker`。
3. 创建 Cloudflare Access Self-hosted Application，覆盖 `analytics.example.com/*`，只允许可信用户邮箱。
4. Access 的 Application Audience 写入 `CF_ACCESS_AUD`，Team Domain 写入 `CF_ACCESS_TEAM_DOMAIN`。
5. 确认 Worker 设置中的 `workers.dev` 为关闭状态。

Access 在边缘验证浏览器会话，并向 Worker 注入 `Cf-Access-Jwt-Assertion`；Worker 会再次验证签名、issuer、audience 和邮箱。

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

不配置 GitHub Actions Workflow。后续部署均由操作者在本地完成完整验证后，按本节的 Wrangler 命令依次执行 D1 Migration、Worker 部署和 Pages 部署。

## 6. 上线验收

1. 未登录访问页面应进入 Access 登录；未携带 JWT 直接调用 `/api/assets` 应返回 401。
2. `GET /health` 返回 `{"status":"ok"}`。
3. 登录后上传一份小型 CSV/XLSX，并确认资产预览可读取。
4. 使用该资产创建一次分析，并确认受限图表可正常渲染。

## 7. Staging 环境

Staging 与生产必须使用独立的 Worker、D1、R2、Pages 项目和 Access Application。不要把 `ENVIRONMENT` 设置为 `test`：该值只供本地 E2E 使用，会启用仓库内测试 JWT 与固定 LLM 响应；云端测试环境固定使用 `staging`。

### 7.1 初始化资源与配置

在 `apps/worker/` 下复制模板后，填入新建 D1 的真实 ID，以及 staging Access Application 的 Team Domain 和 Audience：

```bash
cp wrangler.staging.example.jsonc wrangler.staging.jsonc
pnpm exec wrangler r2 bucket create data-analyze-data-staging
pnpm exec wrangler d1 create data-analyze-db-staging
```

创建 `staging.example.com` 的 Pages 自定义域、两条 Worker Route（`/api/*`、`/health`）及独立 Access Application。实际 `wrangler.staging.jsonc` 已被 Git 忽略；不得将其复制回 `wrangler.jsonc`，也不得复用生产 D1 ID、R2 Bucket 或 Access Audience。

为 staging Worker 单独写入可限额的 LLM Key：

```bash
pnpm exec wrangler secret put LLM_API_KEY --config wrangler.staging.jsonc
```

### 7.2 手工部署

先完成本地验证，再在 `apps/worker/` 下按顺序执行：

```bash
pnpm exec wrangler d1 migrations apply data-analyze-db-staging --remote --config wrangler.staging.jsonc
pnpm exec wrangler deploy --config wrangler.staging.jsonc
pnpm --dir ../web build
pnpm exec wrangler pages deploy ../web/dist --project-name data-analyze-staging
```

前端默认使用同源 `/api`，因此 staging Pages 自定义域与 Worker Route 绑定在同一子域名时，不需要设置 `VITE_API_BASE_URL`。每次上线先部署 staging 并完成本节验收，再对生产环境执行第 5 节的对应命令。

### 7.3 配额与成本边界

Workers、D1 与 R2 的免费额度在同一 Cloudflare 账号内由生产和 staging 共用。测试数据必须使用脱敏的小文件，并在验收后删除不需要的资产，避免 R2 存储翻倍；分析请求会调用真实 LLM，必须使用独立 Key 并在上游设置额度或预算。

## 8. Secret 轮换

重新执行 `pnpm --filter @data-analyze/worker exec wrangler secret put LLM_API_KEY` 即可原地更新 Worker Secret。轮换后执行一次资产元数据建议和分析规则生成冒烟测试。

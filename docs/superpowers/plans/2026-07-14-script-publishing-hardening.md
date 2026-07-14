# 脚本发布与系统加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已完成的数据分析和报表系统增加 Cloudflare Access 身份校验、可信脚本候选发布、结构化日志、全链路测试和可重复部署说明。

**Architecture:** 隐藏管理页将受信 TypeScript 脚本提交到 GitHub 候选分支并创建 Pull Request；CI 校验通过后由用户人工合并，再部署 Worker 并同步脚本索引。所有 API 通过 Cloudflare Access JWT 认证，Secret 仅存在 Worker/GitHub Secrets。

**Tech Stack:** 继承计划 1、2、3；jose 6.2.3、GitHub REST API、GitHub Actions、Cloudflare Access、Wrangler 4.110.0、Playwright 1.61.1、Vitest 4.1.10。

## Global Constraints

- 必须先完成前三份实施计划。
- 系统是单个可信用户自用，但所有页面和 API 仍必须通过 Cloudflare Access。
- `/internal/scripts` 不出现在导航和站点地图；隐藏路由不是安全边界。
- 上传脚本视为受信代码，但必须经过精确 ID/版本校验、测试、人工合并和重新部署才能使用。
- Worker Secret 包含 LLM 和 GitHub 凭据；前端、日志、D1 和 R2 均不得存储这些 Secret。
- 构建产物脚本注册表是事实来源，D1 `scripts` 表是同步索引；同步失败时新脚本不开放。
- 日志不记录 Prompt 全文、原始数据、R2 临时地址、LLM Key 或 GitHub Token。
- 不实现多租户、动态沙箱、自动合并、自动字段猜测和完整导出功能。
- 代码中的函数、变量及复杂业务逻辑添加简体中文注释。
- 每项实现遵循 TDD；每个任务单独提交。

---

## 文件职责映射

```text
apps/worker/src/middleware/access-auth.ts        # Cloudflare Access JWT 校验
apps/worker/src/lib/logger.ts                    # 脱敏结构化日志
apps/worker/src/features/script-admin/           # 上传、GitHub 分支和 PR API
apps/web/src/features/scripts/ScriptUploadPage.tsx
scripts/validate-script-registry.ts              # CI 注册表一致性检查
.github/workflows/ci.yml                         # 类型检查、测试、构建和 E2E
.github/workflows/deploy.yml                     # Worker、Pages 部署及脚本同步
tests/e2e/                                       # 主链路浏览器测试
docs/runbooks/cloudflare-deployment.md            # 环境和部署操作手册
```

### Task 1: 实现 Cloudflare Access JWT 强制认证

**Files:**
- Create: `apps/worker/src/middleware/access-auth.ts`
- Create: `apps/worker/src/middleware/access-auth.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/wrangler.jsonc`
- Modify: `apps/worker/package.json`

**Interfaces:**
- Consumes: `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`Cf-Access-Jwt-Assertion`。
- Produces: `requireAccess()` Hono middleware 和 `AuthenticatedUser` Context Variable。

- [ ] **Step 1: 安装固定依赖并写认证失败测试**

Run: `pnpm --filter @data-analyze/worker add jose@6.2.3`

```ts
it('缺少 Access JWT 时拒绝 API 请求', async () => {
  const response = await app.request('/api/templates', {}, env)
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'ACCESS_TOKEN_REQUIRED' })
})

it('aud 不匹配时拒绝请求', async () => {
  const response = await requestWithSignedJwt({ aud: ['wrong-aud'], email: 'owner@example.com' })
  expect(response.status).toBe(401)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/middleware/access-auth.test.ts`

Expected: FAIL，未认证请求仍能访问 API。

- [ ] **Step 3: 实现 JWT 校验**

```ts
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export function requireAccess(): MiddlewareHandler<WorkerEnv> {
  return async (context, next) => {
    const token = context.req.header('Cf-Access-Jwt-Assertion')
    if (!token) return context.json({ code: 'ACCESS_TOKEN_REQUIRED', message: '需要登录' }, 401)

    const issuer = `https://${context.env.CF_ACCESS_TEAM_DOMAIN}`
    const jwks = getOrCreateJwks(jwksByIssuer, issuer)
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: context.env.CF_ACCESS_AUD,
    })

    if (typeof payload.email !== 'string') {
      return context.json({ code: 'ACCESS_EMAIL_REQUIRED', message: '身份缺少邮箱' }, 401)
    }
    context.set('authenticatedUser', { email: payload.email })
    await next()
  }
}
```

`getOrCreateJwks` 使用 `${issuer}/cdn-cgi/access/certs` 创建 `createRemoteJWKSet` 并按 issuer 缓存，测试中注入本地 JWKS，禁止真实网络请求。

只对 `/health` 保留无认证访问；`/api/*` 和 `/internal/*` 全部应用 middleware。`wrangler.jsonc` 设置 `workers_dev: false`，避免绕过自定义域名上的 Access。

- [ ] **Step 4: 运行认证和全部 Worker 测试**

Run: `pnpm --filter @data-analyze/worker test`

Expected: PASS；现有路由测试通过测试 JWT 或测试环境认证 helper 访问。

- [ ] **Step 5: 提交**

```bash
git add apps/worker
git commit -m "feat(auth): enforce cloudflare access jwt"
```

### Task 2: 定义候选脚本上传和 GitHub API 客户端

**Files:**
- Create: `packages/contracts/src/script-upload.ts`
- Create: `packages/contracts/src/script-upload.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/worker/src/features/script-admin/github.ts`
- Create: `apps/worker/src/features/script-admin/github.test.ts`

**Interfaces:**
- Consumes: `ScriptMetadataSchema`、`GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BASE_BRANCH`。
- Produces: `ScriptUploadRequestSchema`、`createScriptPullRequest(request, env)`。

- [ ] **Step 1: 写非法路径、重复版本和 GitHub 请求测试**

```ts
it('拒绝脚本 ID 中的路径字符', () => {
  const result = ScriptUploadRequestSchema.safeParse({
    id: '../escape',
    version: '1.0.0',
    source: 'export const metadata = {}',
  })
  expect(result.success).toBe(false)
})

it('使用固定候选分支和目标目录创建 PR', async () => {
  const result = await createScriptPullRequest(validUpload, env)
  expect(result.branch).toBe('script-candidate/regional-sales-1.1.0')
  expect(result.path).toBe('packages/scripts/src/regional-sales/1.1.0.ts')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/contracts test -- script-upload.test.ts && pnpm --filter @data-analyze/worker test -- src/features/script-admin/github.test.ts`

Expected: FAIL，上传契约和 GitHub 客户端不存在。

- [ ] **Step 3: 实现上传契约和 GitHub 调用**

上传 Schema 要求：ID 只允许小写字母、数字和连字符；版本为 SemVer；源码非空且不超过 256 KB；metadata 中 ID 和版本必须与请求一致。

GitHub 客户端依次执行：读取 base branch SHA、创建 `script-candidate/{id}-{version}`、写入固定路径、更新注册表入口、创建 Pull Request。任一 GitHub 非 2xx 响应解析为 `GITHUB_API_ERROR`，不得把响应 Authorization Header 写入日志。

- [ ] **Step 4: 运行上传契约和客户端测试**

Run: `pnpm --filter @data-analyze/contracts test -- script-upload.test.ts && pnpm --filter @data-analyze/worker test -- src/features/script-admin/github.test.ts`

Expected: PASS，覆盖非法 ID、超大小、重复版本、分支冲突和 GitHub 5xx。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts apps/worker/src/features/script-admin
git commit -m "feat(admin): add script pull request client"
```

### Task 3: 完成隐藏脚本管理 API 和页面

**Files:**
- Create: `apps/worker/src/features/script-admin/routes.ts`
- Create: `apps/worker/src/features/script-admin/routes.test.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/web/src/features/scripts/ScriptUploadPage.tsx`
- Create: `apps/web/src/features/scripts/ScriptUploadPage.test.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes: `createScriptPullRequest`、脚本上传契约、Access 用户。
- Produces: `POST /internal/scripts/candidates` 和 `/internal/scripts` 页面。

- [ ] **Step 1: 写未认证、源码预览和 PR 返回测试**

```tsx
it('提交前显示完整源码和目标仓库路径', async () => {
  render(<ScriptUploadPage />)
  await userEvent.type(screen.getByLabelText('脚本 ID'), 'regional-sales')
  await userEvent.type(screen.getByLabelText('版本'), '1.1.0')
  await uploadFile('regional-sales.ts', validScriptSource)
  expect(screen.getByText('packages/scripts/src/regional-sales/1.1.0.ts')).toBeVisible()
  expect(screen.getByRole('code')).toHaveTextContent('export const metadata')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/features/script-admin/routes.test.ts && pnpm --filter @data-analyze/web test -- ScriptUploadPage.test.tsx`

Expected: FAIL，路由和页面不存在。

- [ ] **Step 3: 实现 API 和页面**

API 强制经过 `requireAccess()`，解析源码并核对 metadata，不允许覆盖注册表中已有精确版本。成功返回：

```json
{
  "branch": "script-candidate/regional-sales-1.1.0",
  "pullRequestUrl": "https://github.com/example/data-analyze/pull/12",
  "status": "awaiting_ci"
}
```

页面不加入主导航和路由跳转链接；表单展示 ID、版本、源码预览、目标路径和 PR URL。页面不提供自动合并按钮。

- [ ] **Step 4: 运行脚本管理测试**

Run: `pnpm --filter @data-analyze/worker test -- src/features/script-admin && pnpm --filter @data-analyze/web test -- ScriptUploadPage.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src/features/script-admin apps/worker/src/index.ts apps/web/src/features/scripts apps/web/src/router.tsx
git commit -m "feat(admin): add hidden script upload flow"
```

### Task 4: 建立脚本注册表 CI 和部署后同步

**Files:**
- Create: `scripts/validate-script-registry.ts`
- Create: `scripts/validate-script-registry.test.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Create: `apps/worker/src/features/script-admin/sync.ts`
- Create: `apps/worker/src/features/script-admin/sync.test.ts`
- Modify: `apps/worker/src/features/script-admin/routes.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: 构建期 `listScriptMetadata()`、D1 `scripts` 表、Access Service Token。
- Produces: `pnpm validate:scripts`、`POST /internal/scripts/sync`、PR CI 和 main 部署流程。

- [ ] **Step 1: 写重复 ID/版本和同步失败测试**

```ts
it('注册表存在重复 ID 和版本时退出失败', () => {
  expect(() => validateRegistry([metadata, metadata])).toThrow('DUPLICATE_SCRIPT_VERSION')
})

it('只在完整注册表校验后更新 D1 索引', async () => {
  await syncScriptCatalog(env)
  expect(env.DB.batch).toHaveBeenCalledTimes(1)
  expect(env.DB.batch.mock.calls[0]?.[0]).toHaveLength(listScriptMetadata().length)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run scripts/validate-script-registry.test.ts apps/worker/src/features/script-admin/sync.test.ts`

Expected: FAIL，校验和同步模块不存在。

- [ ] **Step 3: 实现注册表校验和同步接口**

校验器逐个执行 `ScriptMetadataSchema.parse`，检查 ID/版本唯一、输入和输出字段名唯一、参数 Schema 可解析。同步接口使用一个 D1 batch upsert 全部 metadata，并将构建产物中不存在的旧版本标记为不可用于新任务；被历史任务引用的记录不得删除。

- [ ] **Step 4: 创建 CI 和部署 Workflow**

`ci.yml` 在 Pull Request 执行：

```yaml
- run: corepack enable
- run: pnpm install --frozen-lockfile
- run: pnpm validate:scripts
- run: pnpm typecheck
- run: pnpm test
- run: pnpm build
```

`deploy.yml` 只在 `main` 执行 D1 Migration、Worker 部署、Pages 构建和部署，再使用 `CF-Access-Client-Id`、`CF-Access-Client-Secret` 调用 `/internal/scripts/sync`。同步失败使 Workflow 失败，但新脚本在 D1 中不可见，旧脚本继续可用。

- [ ] **Step 5: 运行本地 CI 等价命令**

Run: `pnpm validate:scripts && pnpm typecheck && pnpm test && pnpm build`

Expected: 全部退出码为 0。

- [ ] **Step 6: 提交**

```bash
git add scripts .github apps/worker/src/features/script-admin package.json
git commit -m "ci: validate deploy and sync script catalog"
```

### Task 5: 实现结构化错误和敏感日志防护

**Files:**
- Create: `apps/worker/src/lib/errors.ts`
- Create: `apps/worker/src/lib/logger.ts`
- Create: `apps/worker/src/lib/logger.test.ts`
- Create: `apps/worker/src/middleware/error-handler.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/features/llm/client.ts`
- Modify: `apps/worker/src/features/tasks/executor.ts`

**Interfaces:**
- Consumes: 全部 API 和任务错误。
- Produces: `AppError`、`createLogger(context)`、统一错误响应和关联 ID。

- [ ] **Step 1: 写敏感字段泄露测试**

```ts
it('日志移除密钥、Prompt、原始记录和对象地址', () => {
  logger.error('执行失败', {
    taskId: 'task-1',
    LLM_API_KEY: 'secret',
    prompt: '完整 Prompt',
    rawRecord: { name: '张三' },
    objectKey: 'data-analyze/datasets/private.csv',
  })

  const output = JSON.stringify(logSink.entries)
  expect(output).toContain('task-1')
  expect(output).not.toContain('secret')
  expect(output).not.toContain('张三')
  expect(output).not.toContain('private.csv')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @data-analyze/worker test -- src/lib/logger.test.ts`

Expected: FAIL，logger 不存在。

- [ ] **Step 3: 实现错误分类和日志白名单**

日志只允许 `requestId`、`planId`、`taskId`、`datasetId`、`scriptId`、`scriptVersion`、`reportId`、`errorCode`、`durationMs`。其他字段不序列化。错误中间件生成 `requestId` 并返回：

```json
{
  "code": "FIELD_TYPE_MISMATCH",
  "message": "字段值不符合模板类型",
  "requestId": "uuid",
  "details": []
}
```

生产响应不包含堆栈；测试和本地环境允许将堆栈写入受控测试 Sink。

- [ ] **Step 4: 运行日志和 Worker 全量测试**

Run: `pnpm --filter @data-analyze/worker test`

Expected: PASS；敏感样例不会出现在捕获日志中。

- [ ] **Step 5: 提交**

```bash
git add apps/worker/src
git commit -m "feat(worker): add safe structured observability"
```

### Task 6: 增加主链路 Playwright 测试

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/sales.csv`
- Create: `tests/e2e/helpers.ts`
- Create: `tests/e2e/test-access-token.ts`
- Create: `tests/e2e/main-flow.spec.ts`
- Create: `tests/e2e/unsupported-flow.spec.ts`
- Create: `apps/worker/src/testing/fake-llm.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: 三个计划产生的全部主链路。
- Produces: `pnpm test:e2e`，覆盖成功和明确拒绝路径。

- [ ] **Step 1: 安装固定测试依赖并写失败 E2E**

Run:

```bash
pnpm add -D @playwright/test@1.61.1
pnpm exec playwright install chromium
```

```ts
test('创建模板到发布报表的主链路', async ({ page }) => {
  await page.goto('/templates/new')
  await createSalesTemplate(page)
  await uploadDataset(page, 'tests/e2e/fixtures/sales.csv')
  await mapField(page, '销售金额', 'salesAmount')
  await requestAnalysis(page, '按区域汇总销售额')
  await expect(page.getByText('sales-region-summary@1.0.0')).toBeVisible()
  await page.getByRole('button', { name: '确认并执行' }).click()
  await expect(page.getByText('执行成功')).toBeVisible()
  await createAndPublishReport(page, '使用柱状图展示区域销售额')
  await expect(page.getByRole('heading', { name: '区域销售概览' })).toBeVisible()
})
```

- [ ] **Step 2: 运行 E2E 确认失败**

Run: `pnpm test:e2e`

Expected: FAIL，测试服务器或 helper 尚未配置。

- [ ] **Step 3: 配置本地服务和固定 LLM 响应**

Playwright `webServer` 同时启动 `wrangler dev --local` 和 Vite。`ENVIRONMENT=test` 时 LLM Binding 使用 `fake-llm.ts` 的精确脚本推荐和报表配置，不访问网络。Queue 在本地测试配置中立即消费。`test-access-token.ts` 使用本地测试私钥签发只面向测试 audience 的 JWT，Playwright 通过 `page.route('/api/**')` 添加该 Token；生产代码不存在认证旁路。`tests/e2e/helpers.ts` 明确定义并导出 `createSalesTemplate(page)`、`uploadDataset(page, path)`、`mapField(page, source, target)`、`requestAnalysis(page, requirement)`、`createAndPublishReport(page, requirement)` 五个 helper，内部只使用可见标签和 role 定位元素。

- [ ] **Step 4: 补充不支持和字段错误 E2E**

`unsupported-flow.spec.ts` 覆盖 LLM 返回 `supported:false` 后无执行按钮，以及必填字段未映射时无法进入推荐阶段。

- [ ] **Step 5: 运行 E2E 和全部验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected: 全部退出码为 0，Playwright 报告 3 个主链路场景通过。

- [ ] **Step 6: 提交**

```bash
git add playwright.config.ts tests apps/worker/src/testing package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "test(e2e): cover analysis and report lifecycle"
```

### Task 7: 编写 Cloudflare 部署与恢复操作手册

**Files:**
- Create: `.dev.vars.example`
- Create: `docs/runbooks/cloudflare-deployment.md`
- Create: `docs/runbooks/incident-recovery.md`
- Create: `README.md`

**Interfaces:**
- Consumes: 全部环境变量、Bindings、Migration 和部署 Workflow。
- Produces: 新环境从零部署、密钥轮换、失败恢复和本地启动命令。

- [ ] **Step 1: 写环境变量示例**

```dotenv
LLM_BASE_URL=https://llm-gateway.example.com/v1
LLM_MODEL=data-analysis-model
CF_ACCESS_TEAM_DOMAIN=example.cloudflareaccess.com
CF_ACCESS_AUD=replace-with-access-audience
GITHUB_OWNER=replace-with-owner
GITHUB_REPO=data-analyze-project
GITHUB_BASE_BRANCH=main
```

`.dev.vars.example` 只包含非 Secret 示例；`LLM_API_KEY` 和 `GITHUB_TOKEN` 只写设置命令名称，不写示例值。

- [ ] **Step 2: 写部署手册**

手册必须包含：创建 D1、R2、Queue；配置 Worker Bindings；使用 `wrangler secret put` 写入两个 Secret；创建 Pages 项目；为 Pages 和 Worker 自定义域配置 Access；关闭 `workers.dev`；配置 GitHub Actions Secrets；执行 Migration；部署；调用 `/health` 和受保护 API 验证。

- [ ] **Step 3: 写恢复手册**

恢复手册覆盖：Migration 成功但部署失败时继续运行旧 Worker；脚本同步失败时重新触发同步；Queue 暂时积压时检查和重试；错误脚本发布时回滚 Git 提交并重新部署；LLM Key 和 GitHub Token 泄露时轮换 Secret。

- [ ] **Step 4: 运行文档命令和最终验证**

Run:

```bash
pnpm validate:scripts
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
git diff --check
```

Expected: 全部退出码为 0；`.dev.vars.example` 不包含真实 Secret。

- [ ] **Step 5: 提交**

```bash
git add .dev.vars.example README.md docs/runbooks
git commit -m "docs: add deployment and recovery runbooks"
```

## 计划 4 验收结果

完成后，整个系统受到 Cloudflare Access 保护，受信管理员能够通过隐藏页面创建候选脚本 Pull Request，CI 和人工合并控制发布，新脚本部署后同步到 D1；主数据加工和报表生命周期具备脱敏日志、结构化错误、端到端测试和可重复部署手册。

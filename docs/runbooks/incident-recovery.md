# 故障恢复操作手册

## 通用原则

先记录响应中的 `requestId`、`taskId`、`scriptId@version` 和部署 Commit。日志只允许关联 ID、错误码和耗时，不要把 Prompt、原始数据、R2 Key、LLM Key 或 GitHub Token复制到 Issue、日志或聊天工具。

## Migration 成功但部署失败

D1 Migration 采用向前兼容的新增结构时，旧 Worker 继续运行。不要回滚或手工删除已应用 Migration：

1. 保留当前旧 Worker 流量。
2. 修复构建或部署错误，重新运行同一 `main` Workflow。
3. Wrangler 会跳过已经应用的 Migration，再部署 Worker/Pages。
4. 部署后重新同步脚本目录并执行冒烟测试。

若 Migration 与旧 Worker 不兼容，立即停止继续发布，由新的补偿 Migration 恢复兼容；禁止直接修改生产 D1 表结构。

## 脚本目录同步失败

同步在一个 D1 batch 内完成，失败不会留下半套目录：

1. 确认 Worker 已部署到包含目标脚本的 Commit。
2. 检查 Access Service Token、`WORKER_BASE_URL` 和 D1 Binding。
3. 重新调用 `POST /internal/scripts/sync` 或重新运行部署 Workflow。
4. 查询 D1 `scripts` 表，确认新版本 `enabled=1`；旧版本可保留但应为 `enabled=0`。

不要手工删除旧脚本记录，历史执行计划可能仍引用它们。

## Queue 积压或暂时性失败

1. 查看 Queue backlog、consumer 错误率和 Worker 请求日志中的 `taskId`/`errorCode`。
2. 暂时性基础设施错误最多重试三次；确认 R2、D1 和 Queue 服务恢复后观察 backlog 消退。
3. 非重试错误会写入任务错误对象并标记 `failed`，不要盲目重放；先修复字段、脚本或数据问题，再创建新计划。
4. 若 consumer 部署异常，回滚 Worker 到上一个健康版本，保持 Queue 消息等待，修复后再恢复消费。

## 错误脚本已发布

1. 停止用该脚本版本创建新计划；必要时在 D1 将精确版本标记为 `enabled=0`。
2. 在 Git 中 revert 引入脚本及注册表入口的 Commit，禁止覆盖同一个 SemVer 文件。
3. 运行 `pnpm validate:scripts`、完整测试和 E2E。
4. 重新部署 Worker并调用目录同步。
5. 修复版本使用新的 SemVer 重新走候选 PR、CI、人工合并和部署流程。

已完成任务的 R2 结果和历史脚本索引不删除；需要纠正数据时创建新的处理任务和报表版本。

## LLM Key 泄露

1. 立即在 LLM 平台吊销旧 Key并创建新 Key。
2. 执行 `pnpm --filter @data-analyze/worker exec wrangler secret put LLM_API_KEY`。
3. 检查平台调用记录和额度异常，必要时临时限制模型或账户。
4. 完成一次脚本推荐和报表生成冒烟测试。

## GitHub Token 泄露

1. 立即在 GitHub 吊销 Token，检查异常分支、Commit 和 Pull Request。
2. 创建最小权限新 Token。
3. 执行 `pnpm --filter @data-analyze/worker exec wrangler secret put GITHUB_TOKEN`。
4. 创建候选脚本 PR 验证，不执行自动合并。

## Access Service Token 泄露

1. 在 Cloudflare Access 吊销旧 Service Token。
2. 创建新 Token并更新 GitHub Actions 的 `CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`。
3. 重新运行脚本同步步骤，确认 2xx。
4. 检查 Access Audit Log 中对 `/internal/scripts/*` 的异常访问。

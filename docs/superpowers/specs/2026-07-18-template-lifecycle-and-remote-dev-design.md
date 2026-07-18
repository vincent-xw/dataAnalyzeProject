# 模板生命周期与远端开发资源设计

## 目标

让已创建的分析模板能够被预览、编辑和安全删除；本地启动的 Worker 连接 Cloudflare 的远端开发资源，而不是本地 D1、R2 或 Queue 模拟资源。

## 模板 API

保留现有 `GET /api/templates/:id` 作为模板详情接口。新增 `PUT /api/templates/:id`，请求体与创建模板相同；它原子更新名称、描述和字段 Schema，并为两个 Prompt 各创建一个新版本，将模板当前 Prompt 指针一起更新。每次编辑均保留旧 Prompt 版本，以确保已有执行计划和任务继续引用其创建时的版本。

新增 `DELETE /api/templates/:id`。删除前服务层查询 `datasets`、`field_mappings` 与 `data_assets` 是否引用模板；任一存在时返回 `409 TEMPLATE_IN_USE` 和中文可操作提示。未引用时，先删除该模板的 Prompt 版本，再删除模板记录。未找到模板时返回 `404 TEMPLATE_NOT_FOUND`。

## 前端体验

模板列表的每项提供“预览”“编辑”“删除”操作。预览页读取详情并只读展示名称、描述、标准字段和两个当前 Prompt；编辑页复用现有模板表单，初始化为详情数据，提交时调用 `PUT`，成功后返回列表。新建页保持现有创建逻辑和字段生成工具。

删除按钮在浏览器确认后调用删除 API。删除成功后从列表移除项目；删除被引用模板时保留项目并显示后端错误。加载、保存和删除失败均在页面内显示中文错误。

## 路由与组件边界

`TemplateEditorPage` 接收可选编辑模式或由路径参数加载详情，以维持字段编辑、Prompt 放大编辑和表头生成这一套表单实现。新增轻量的 `TemplatePreviewPage` 专责只读展示。路由增加 `/templates/:templateId` 与 `/templates/:templateId/edit`，并把 `/templates/new` 放在参数路由之前。

## 本地开发资源

`dev:worker` 不再执行 `d1 ... --local` 的 Migration 或脚本目录初始化，也不传递 `--local` 与本地持久化目录。它以 `wrangler dev --remote` 启动本地 Worker 进程，远端使用 `wrangler.jsonc` 中配置的 D1、R2 与 Queue。`ENVIRONMENT:development` 继续显式传入，因此本地认证代理行为不变。

远端资源必须是开发环境专用的 Cloudflare 资源，不能指向生产 D1、R2 bucket 或 Queue；本次仅调整代码与说明，资源创建及绑定名称由现有 Cloudflare 配置负责。测试与 E2E 启动脚本继续使用本地资源，避免测试访问远端环境。

## 验证

Worker 路由测试覆盖更新后 Prompt 递增、删除成功、删除不存在与删除被引用时的 409；前端测试覆盖列表操作入口、预览展示、编辑保存和删除错误提示。开发脚本测试或静态检查验证 `dev:worker` 使用 `--remote` 且不使用本地 D1 初始化。完整验证运行 `pnpm typecheck`、`pnpm test` 与 `pnpm build`；远端开发启动需要有效 Cloudflare 凭据，作为人工联调步骤执行。

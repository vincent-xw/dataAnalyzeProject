# 数据资产分析历史设计

## 目标

在每份数据资产上建立自然语言驱动的数据分析入口。用户创建分析后，可以在历史列表中找到它，并在详情页查看被冻结的分析规则和相同的图表结果。

## 数据与接口

新增 `analyses` 表，仅通过 `asset_id` 关联 `data_assets`。每条记录保存用户需求、标题、受限 `ReportConfig` JSON、状态、失败原因和创建时间。规则是创建时快照，之后不随资产元数据变化。

- `GET /api/assets/:id/analyses`：返回该资产的历史记录摘要。
- `POST /api/assets/:id/analyses`：接收 `requirement`；读取该资产的 schema 与统计信息，向 LLM 请求 `ReportConfig`，经 `ReportConfigSchema` 和字段/容量校验后保存记录。
- `GET /api/assets/:id/analyses/:analysisId`：返回记录、规则与用于受限浏览器渲染的 NDJSON 行。

LLM 只得到字段名、字段类型、行数、字节数和用户需求，不得到完整数据行。模型异常、协议异常、未知字段或容量超限时，以明确错误响应返回且创建 `failed` 历史记录；详情页可展示失败原因。

## 页面

资产详情页添加“数据分析”入口。分析列表页提供历史记录、创建时间、需求、状态和“新建分析”表单。详情页展示需求、规则 JSON 和图表；使用 ECharts 处理 bar、line、pie，使用 React 渲染 metric 和 table。初版不支持手动编辑规则、筛选器交互或重试。

## 约束

- 不恢复模板、数据集、任务、报告等旧链路。
- 规则必须复用 `@data-analyze/report-schema` 的 `ReportConfigSchema` 和 `validateReportReferences`。
- 资产数据仍以 R2 中的 NDJSON 为唯一数据源；分析记录不复制数据。
- 所有分析记录只作用于其 URL 中的资产 ID，跨资产访问返回 404。

## 验收

1. 资产详情页能进入分析历史。
2. 自然语言创建成功后出现在历史列表，规则引用字段受校验。
3. 打开成功记录能看到规则并渲染图表；打开失败记录能看到失败原因。
4. Worker 和 Web 覆盖成功、字段不匹配、模型失败和历史详情的测试。

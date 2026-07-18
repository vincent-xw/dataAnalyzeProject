# 可空字段与受控类型转换设计

## 目标

在数据标准化时区分缺失值与无效值：可选字段的缺失值保留为 `null`，必填字段缺失报错；所有字段类型只接受明确白名单内的转换，不产生业务伪值。

## 协议变更

`@data-analyze/script-sdk` 的 `StandardValue` 扩展为 `string | number | boolean | null`。所有消费或产生 `StandardRecord` 的脚本、输出校验、NDJSON 写入与报表读取必须接受 `null`，但不得把 `null` 转成空字符串、零或当前日期。

## 标准化规则

缺失值定义为 `null`、`undefined`、空字符串或仅空白字符。映射字段为可选时输出 `null`；映射字段为必填时抛出非重试错误 `FIELD_REQUIRED`，错误包含标准字段名与数据行号。

非空值按目标类型受控转换：string 使用 `String(value)`；number 去除首尾空白后仅接受现有十进制格式；boolean 接受 `true/false`、`1/0`、`是/否`、`yes/no`（大小写无关）；date 接受 `YYYY-MM-DD`、`YYYY/MM/DD`、有效 ISO 日期时间和 Excel 日期序列号，统一输出 `YYYY-MM-DD`。任何非空、非白名单格式的值保持 `FIELD_TYPE_MISMATCH`。

## 错误与可观测性

标准化器接收行号并将其写入 `FIELD_REQUIRED` 与 `FIELD_TYPE_MISMATCH` 消息；原始值仅以截断的安全摘要记录，避免把完整敏感数据写入任务错误对象。空值转换不产生警告或默认业务值。

## 验证

为四种类型分别覆盖可选空值、必填空值、允许转换和拒绝转换；覆盖 Excel 日期序列号和非法日期。执行器测试验证错误带行号，脚本 SDK 与报表协议测试验证 `null` 可穿透。运行 `pnpm typecheck`、`pnpm test` 与 `pnpm build`，并单独记录现有无关类型检查失败。

# 系统分析提示词设置设计

分析规则的系统提示词从代码常量迁移到 D1。`system_prompt_versions` 追加保存默认与人工版本；`system_prompt_settings` 以固定键 `analysis_rules` 指向当前生效版本。保存人工编辑、新建默认恢复、切换历史版本都只改变当前指针，不删除任何版本。

系统设置页可查看当前版本、来源、时间、内容与历史版本，支持保存、切换和一键恢复默认。默认内容写明实际 `ReportConfig` 协议、合法字段来源与当前图表能力边界，禁止模型生成 `report/charts/xField/seriesField` 等不存在的格式。

创建分析时读取当前提示词，传入 LLM，并把 `prompt_version_id` 保存到 `analyses`；历史分析由此可追溯实际使用的规则。初版不删除版本、不恢复旧模板链路，也不扩展 count 或多系列图表协议。

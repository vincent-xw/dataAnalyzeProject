import type { DatasetInspection, FieldDefinition, ScriptDecision } from '@data-analyze/contracts'
import type { ReportConfig } from '@data-analyze/report-schema'

import type { ProcessingContext } from '../features/llm/prompt'

/** E2E 固定脚本决策只依赖显式需求文本，不访问网络或读取实际数据行。 */
export function createFakeScriptDecision(context: ProcessingContext): ScriptDecision {
  if (context.userRequirement.includes('不支持')) {
    return {
      supported: false,
      scriptId: null,
      scriptVersion: null,
      parameters: null,
      reason: '当前构建注册表没有能够完整处理该需求的脚本',
      limitations: ['需求超出固定脚本能力范围'],
    }
  }
  return {
    supported: true,
    scriptId: 'sales-region-summary',
    scriptVersion: '1.0.0',
    parameters: { includeEmptyRegion: false },
    reason: '区域销售汇总脚本与字段结构和本次需求完全匹配',
    limitations: [],
  }
}

export function createFakeFieldDefinitions(inspection: DatasetInspection): FieldDefinition[] {
  return inspection.sourceFields.map((sourceField, index) => ({
    name: sourceField.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || `field_${index + 1}`,
    type: 'string',
    sourceLabel: sourceField,
    required: false,
  }))
}

/** E2E 固定报表配置严格使用系统内置组件和脚本输出字段。 */
export function createFakeReportConfig(): ReportConfig {
  return {
    title: '区域销售概览',
    description: '按区域展示销售汇总结果',
    filters: [],
    widgets: [
      {
        id: 'total-sales',
        type: 'metric',
        title: '销售总额',
        dataset: 'result',
        metric: 'totalAmount',
        aggregation: 'sum',
        format: 'currency',
        layout: { x: 0, y: 0, w: 4, h: 2 },
      },
      {
        id: 'sales-by-region',
        type: 'bar',
        title: '区域销售额',
        dataset: 'result',
        dimension: 'region',
        metric: 'totalAmount',
        layout: { x: 0, y: 2, w: 12, h: 5 },
      },
    ],
  }
}

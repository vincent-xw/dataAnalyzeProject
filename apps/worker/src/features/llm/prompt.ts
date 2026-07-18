import type { FieldDefinition, ScriptMetadata } from '@data-analyze/contracts'

export const PROCESSING_PLATFORM_RULES = [
  '只能选择一个清单内脚本及其精确版本。',
  '不得生成代码。',
  '不得组合脚本。',
  '不得发明字段或参数。',
  '无法完整满足需求时必须返回 supported:false。',
  '只返回一个合法 JSON 对象，不要使用 Markdown 代码块。',
  '支持时必须返回：{"supported":true,"scriptId":"清单内脚本 ID","scriptVersion":"清单内 x.y.z 版本","parameters":{},"reason":"中文理由","limitations":[]}。',
  '不支持时必须返回：{"supported":false,"scriptId":null,"scriptVersion":null,"parameters":null,"reason":"中文理由","limitations":["至少一项限制"]}。',
  '不得增加以上 JSON 结构以外的字段。',
].join('\n')

export type ProcessingContext = {
  platformRules: string
  dataset: {
    rowCount: number
    columnCount: number
    fields: FieldDefinition[]
  }
  scripts: ScriptMetadata[]
  templatePrompt: string
  userRequirement: string
}

type ProcessingContextInput = Omit<ProcessingContext, 'platformRules' | 'dataset'> & {
  rowCount: number
  columnCount: number
  fields: FieldDefinition[]
}

/**
 * 参数刻意不包含数据行、对象 Key 或 R2 URL，从类型边界阻止原始数据进入模型上下文。
 */
export function buildProcessingContext(input: ProcessingContextInput): ProcessingContext {
  return {
    platformRules: PROCESSING_PLATFORM_RULES,
    dataset: {
      rowCount: input.rowCount,
      columnCount: input.columnCount,
      fields: input.fields,
    },
    scripts: input.scripts,
    templatePrompt: input.templatePrompt,
    userRequirement: input.userRequirement,
  }
}

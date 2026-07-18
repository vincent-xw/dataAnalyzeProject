const allowedFieldNames = [
  'requestId',
  'planId',
  'taskId',
  'datasetId',
  'scriptId',
  'scriptVersion',
  'reportId',
  'errorCode',
  'failureReason',
  'upstreamStatus',
  'durationMs',
  'operation',
  'stage',
  'fileType',
  'byteSize',
  'rowCount',
  'columnCount',
  'sheetCount',
  'category',
  'status',
  'method',
  'assetCount',
  'widgetCount',
  'filterCount',
  'modelName',
] as const

type AllowedFieldName = (typeof allowedFieldNames)[number]
type SafeFieldValue = string | number
export type SafeLogFields = Partial<Record<AllowedFieldName, SafeFieldValue>>

export type LogEntry = {
  timestamp: string
  level: 'info' | 'error'
  message: string
  fields: SafeLogFields
}

export type LogSink = { write(entry: LogEntry): void }

export type SafeLogger = {
  info(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}
export type SensitiveDebugLogger = { info(message: string, payload: unknown): void }

const consoleSink: LogSink = {
  write(entry) {
    console.log(JSON.stringify(entry))
  },
}

/** 仅复制显式白名单中的字符串和数字，所有复杂对象和未知字段直接丢弃。 */
function sanitizeFields(...sources: Array<Record<string, unknown> | undefined>): SafeLogFields {
  const safe: SafeLogFields = {}
  for (const source of sources) {
    if (!source) continue
    for (const name of allowedFieldNames) {
      const value = source[name]
      if (typeof value === 'string' || typeof value === 'number') safe[name] = value
    }
  }
  return safe
}

/** 创建只接受安全关联字段的结构化 logger。 */
export function createLogger(
  baseFields: Record<string, unknown> = {},
  sink: LogSink = consoleSink,
): SafeLogger {
  function write(level: LogEntry['level'], message: string, fields?: Record<string, unknown>) {
    sink.write({
      timestamp: new Date().toISOString(),
      level,
      message,
      fields: sanitizeFields(baseFields, fields),
    })
  }

  return {
    info: (message, fields) => write('info', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}

/** 仅供本机开发排障，生产环境始终禁用；递归删除常见凭据键后才输出原文诊断。 */
export function createSensitiveDebugLogger(
  env: { ENVIRONMENT?: string; LOG_SENSITIVE_DEBUG?: string },
  sink: LogSink = consoleSink,
  baseFields: Record<string, unknown> = {},
): SensitiveDebugLogger | null {
  if (env.ENVIRONMENT !== 'development' || env.LOG_SENSITIVE_DEBUG !== 'true') return null
  return { info(message, payload) { sink.write({ timestamp: new Date().toISOString(), level: 'info', message, fields: { ...sanitizeFields(baseFields), failureReason: JSON.stringify(redactCredentials(payload)).slice(0, 20_000) } }) } }
}

function redactCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCredentials)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, /token|secret|api.?key|authorization|cookie|password/i.test(key) ? '[REDACTED]' : redactCredentials(nested)]))
}

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

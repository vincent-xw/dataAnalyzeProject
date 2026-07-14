import type { ScriptMetadata } from '@data-analyze/contracts'

export type StandardValue = string | number | boolean
export type StandardRecord = Readonly<Record<string, StandardValue>>

export interface OutputWriter {
  write(record: StandardRecord): Promise<void>
}

export interface ProcessContext<TParameters> {
  readonly taskId: string
  readonly scriptId: string
  readonly scriptVersion: string
  readonly parameters: TParameters
  readonly input: AsyncIterable<StandardRecord>
  readonly output: OutputWriter
  readonly logger: {
    info(message: string, fields?: Record<string, string | number>): void
  }
}

export interface ProcessResult {
  rowCount: number
  summary: Readonly<Record<string, StandardValue>>
}

export interface DataProcessor<TParameters> {
  metadata: ScriptMetadata
  parseParameters(input: unknown): TParameters
  parseOutput(record: unknown): StandardRecord
  process(context: ProcessContext<TParameters>): Promise<ProcessResult>
}

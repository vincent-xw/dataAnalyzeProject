import { ScriptUploadRequestSchema, type ScriptUploadRequest } from '@data-analyze/contracts'
import { z } from 'zod'

import type { Env } from '../../index'
import { requestCandidateScript } from '../llm/client'

const DraftRequestSchema = z.object({
  datasetVersionId: z.string().uuid(),
  requirement: z.string().min(1).max(4_000),
}).strict()

export type CandidateDraft = ScriptUploadRequest & { rationale: string }

/** 仅将当前版本映射、SDK 约束与需求交给模型，绝不读取原始数据行。 */
export async function generateCandidateDraft(
  input: unknown,
  env: Env['Bindings'],
): Promise<CandidateDraft> {
  const request = DraftRequestSchema.parse(input)
  const mappings = await env.DB.prepare(
    `SELECT source_field, target_field, target_type
     FROM field_mappings WHERE dataset_version_id = ? ORDER BY source_field`,
  )
    .bind(request.datasetVersionId)
    .all<{ source_field: string; target_field: string; target_type: string }>()
  if (mappings.results.length === 0) throw new Error('FIELD_MAPPING_MISSING')

  const id = `custom-${crypto.randomUUID().replaceAll('-', '')}`
  const version = '0.1.0'
  const generated = await requestCandidateScript(
    {
      id,
      version,
      requirement: request.requirement,
      fields: mappings.results.map((mapping) => ({
        sourceLabel: mapping.source_field,
        name: mapping.target_field,
        type: mapping.target_type,
      })),
    },
    env,
  )
  const upload = ScriptUploadRequestSchema.parse({ id, version, source: generated.source })
  return { ...upload, rationale: generated.rationale }
}

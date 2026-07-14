import { z } from 'zod'

import { FieldDefinitionSchema } from './dataset'

const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)

export const ParameterPropertySchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean']),
    description: z.string().min(1),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1).optional(),
  })
  .strict()

export const SerializableParameterSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string().min(1), ParameterPropertySchema),
    required: z.array(z.string().min(1)),
    additionalProperties: z.literal(false),
  })
  .strict()
  .superRefine((schema, context) => {
    // required 只能引用真实参数，禁止 LLM 收到自相矛盾的参数协议。
    for (const name of schema.required) {
      if (!(name in schema.properties)) {
        context.addIssue({ code: 'custom', message: `必填参数不存在: ${name}` })
      }
    }
  })

export const ScriptMetadataSchema = z
  .object({
    id: z.string().min(1),
    version: SemanticVersionSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    inputFields: z.array(FieldDefinitionSchema),
    outputFields: z.array(FieldDefinitionSchema),
    parameterSchema: SerializableParameterSchema,
  })
  .strict()

export const SupportedScriptDecisionSchema = z
  .object({
    supported: z.literal(true),
    scriptId: z.string().min(1),
    scriptVersion: SemanticVersionSchema,
    parameters: z.record(z.string(), z.unknown()),
    reason: z.string().min(1),
    limitations: z.array(z.string().min(1)),
  })
  .strict()

export const UnsupportedScriptDecisionSchema = z
  .object({
    supported: z.literal(false),
    scriptId: z.null(),
    scriptVersion: z.null(),
    parameters: z.null(),
    reason: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict()

export const ScriptDecisionSchema = z.discriminatedUnion('supported', [
  SupportedScriptDecisionSchema,
  UnsupportedScriptDecisionSchema,
])

export type ParameterProperty = z.infer<typeof ParameterPropertySchema>
export type SerializableParameter = z.infer<typeof SerializableParameterSchema>
export type ScriptMetadata = z.infer<typeof ScriptMetadataSchema>
export type ScriptDecision = z.infer<typeof ScriptDecisionSchema>


import { Hono } from 'hono'
import { z } from 'zod'

import {
  DatasetInspectionSchema,
  FieldDefinitionSchema,
  FieldMappingListSchema,
} from '@data-analyze/contracts'

import type { Env } from '../../index'
import { InspectionError, inspectCsv } from './inspect-csv'
import { inspectXlsx } from './inspect-xlsx'
import { validateMapping } from './mapping'
import { MAX_FILE_SIZE, parseUploadMetadata, UploadRequestError } from './upload'

const CsvInspectionRequestSchema = z.object({
  encoding: z.enum(['utf-8', 'utf-8-bom', 'gb18030']),
  delimiter: z.enum([',', '\t', ';']),
  selectedSheet: z.never().optional(),
})

const XlsxInspectionRequestSchema = z.object({
  selectedSheet: z.string().min(1).optional(),
  encoding: z.never().optional(),
  delimiter: z.never().optional(),
})

type DatasetVersionRecord = {
  dataset_id: string
  file_type: 'csv' | 'xlsx'
  source_object_key: string
}

export const datasetRoutes = new Hono<Env>()

datasetRoutes.post('/', async (context) => {
  try {
    const metadata = parseUploadMetadata(context.req.raw.headers)
    const template = await context.env.DB.prepare('SELECT id FROM analysis_templates WHERE id = ?')
      .bind(metadata.templateId)
      .first<{ id: string }>()
    if (!template) {
      return context.json({ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }, 404)
    }
    if (!context.req.raw.body) {
      return context.json({ code: 'EMPTY_FILE', message: '上传文件不能为空' }, 400)
    }

    const datasetId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    const objectKey = `data-analyze/datasets/${datasetId}/${versionId}/source/original.${metadata.fileType}`
    const storedObject = await context.env.DATA_BUCKET.put(objectKey, context.req.raw.body, {
      httpMetadata: {
        contentType:
          metadata.fileType === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })

    // Content-Length 由客户端提供，写入后仍以 R2 实际大小复核，防止伪造请求头绕过限制。
    if (storedObject.size > MAX_FILE_SIZE || storedObject.size !== metadata.contentLength) {
      await context.env.DATA_BUCKET.delete(objectKey)
      const code = storedObject.size > MAX_FILE_SIZE ? 'FILE_TOO_LARGE' : 'CONTENT_LENGTH_MISMATCH'
      const status = storedObject.size > MAX_FILE_SIZE ? 413 : 400
      return context.json({ code, message: '文件实际大小与上传约束不符' }, status)
    }

    const now = new Date().toISOString()
    try {
      await context.env.DB.batch([
        context.env.DB.prepare(
          'INSERT INTO datasets (id, template_id, name, created_at) VALUES (?, ?, ?, ?)',
        ).bind(datasetId, metadata.templateId, metadata.fileName, now),
        context.env.DB.prepare(
          `INSERT INTO dataset_versions
            (id, dataset_id, source_object_key, file_type, validation_status, created_at)
           VALUES (?, ?, ?, ?, 'uploaded', ?)`,
        ).bind(versionId, datasetId, objectKey, metadata.fileType, now),
      ])
    } catch (error) {
      await context.env.DATA_BUCKET.delete(objectKey)
      throw error
    }

    return context.json({ id: datasetId, versionId, status: 'uploaded' as const }, 201)
  } catch (error) {
    if (error instanceof UploadRequestError) {
      return context.json({ code: error.code, message: error.message }, error.status)
    }
    throw error
  }
})

datasetRoutes.post('/:versionId/inspect', async (context) => {
  const versionId = context.req.param('versionId')
  const version = await context.env.DB.prepare(
    `SELECT dataset_id, file_type, source_object_key
     FROM dataset_versions WHERE id = ?`,
  )
    .bind(versionId)
    .first<DatasetVersionRecord>()
  if (!version) {
    return context.json({ code: 'DATASET_VERSION_NOT_FOUND', message: '数据集版本不存在' }, 404)
  }

  const object = await context.env.DATA_BUCKET.get(version.source_object_key)
  if (!object) {
    return context.json({ code: 'SOURCE_FILE_NOT_FOUND', message: '原始文件不存在' }, 404)
  }

  const requestBody: unknown = await context.req.json().catch(() => undefined)
  try {
    const content = await object.arrayBuffer()
    if (version.file_type === 'csv') {
      const parsed = CsvInspectionRequestSchema.safeParse(requestBody)
      if (!parsed.success) {
        return context.json({ code: 'INVALID_INSPECTION_OPTIONS', message: 'CSV 检查参数无效' }, 400)
      }
      const inspection = await inspectCsv(content, parsed.data.encoding, parsed.data.delimiter)
      return await saveInspection(context.env, versionId, version.dataset_id, inspection, {
        encoding: parsed.data.encoding,
        delimiter: parsed.data.delimiter,
      })
    }

    const parsed = XlsxInspectionRequestSchema.safeParse(requestBody)
    if (!parsed.success) {
      return context.json({ code: 'INVALID_INSPECTION_OPTIONS', message: 'Excel 检查参数无效' }, 400)
    }
    const result = inspectXlsx(content, parsed.data.selectedSheet)
    if (result.status === 'awaiting_sheet') {
      await context.env.DB.prepare(
        "UPDATE dataset_versions SET validation_status = 'awaiting_sheet' WHERE id = ?",
      )
        .bind(versionId)
        .run()
      return context.json(result)
    }

    return await saveInspection(
      context.env,
      versionId,
      version.dataset_id,
      result.inspection,
      parsed.data.selectedSheet ? { selectedSheet: parsed.data.selectedSheet } : {},
    )
  } catch (error) {
    if (error instanceof InspectionError) {
      const errorObjectKey = `data-analyze/datasets/${version.dataset_id}/${versionId}/errors/inspection.json`
      await context.env.DATA_BUCKET.put(
        errorObjectKey,
        JSON.stringify({ code: error.code, message: error.message }),
        { httpMetadata: { contentType: 'application/json' } },
      )
      await context.env.DB.prepare(
        "UPDATE dataset_versions SET validation_status = 'invalid', error_object_key = ? WHERE id = ?",
      )
        .bind(errorObjectKey, versionId)
        .run()
      return context.json({ code: error.code, message: error.message }, 422)
    }
    throw error
  }
})

datasetRoutes.put('/:versionId/mapping', async (context) => {
  const mappings = FieldMappingListSchema.safeParse(
    await context.req.json().catch(() => undefined),
  )
  if (!mappings.success) {
    return context.json({ code: 'INVALID_MAPPING', message: '字段映射协议无效' }, 400)
  }

  const version = await context.env.DB.prepare(
    `SELECT dv.schema_object_key, dv.validation_status, d.template_id, at.input_schema_json
     FROM dataset_versions dv
     JOIN datasets d ON d.id = dv.dataset_id
     JOIN analysis_templates at ON at.id = d.template_id
     WHERE dv.id = ?`,
  )
    .bind(context.req.param('versionId'))
    .first<{
      schema_object_key: string | null
      validation_status: string
      template_id: string
      input_schema_json: string
    }>()
  if (!version) {
    return context.json({ code: 'DATASET_VERSION_NOT_FOUND', message: '数据集版本不存在' }, 404)
  }
  if (
    !version.schema_object_key ||
    !['inspected', 'mapped'].includes(version.validation_status)
  ) {
    return context.json({ code: 'DATASET_NOT_INSPECTED', message: '数据集尚未完成结构检查' }, 409)
  }

  const schemaObject = await context.env.DATA_BUCKET.get(version.schema_object_key)
  if (!schemaObject) {
    return context.json({ code: 'SCHEMA_NOT_FOUND', message: '数据集结构文件不存在' }, 404)
  }
  const inspection = DatasetInspectionSchema.safeParse(await schemaObject.json())
  const templateFields = z.array(FieldDefinitionSchema).safeParse(JSON.parse(version.input_schema_json))
  if (!inspection.success || !templateFields.success) {
    return context.json({ code: 'INVALID_CONTROL_DATA', message: '控制面结构数据无效' }, 500)
  }

  const validation = validateMapping(
    inspection.data.sourceFields,
    templateFields.data,
    mappings.data,
  )
  if (
    validation.unknownSources.length > 0 ||
    validation.unknownTargets.length > 0 ||
    validation.missingRequired.length > 0
  ) {
    return context.json({ code: 'MAPPING_VALIDATION_FAILED', ...validation }, 422)
  }

  const now = new Date().toISOString()
  const templateByName = new Map(templateFields.data.map((field) => [field.name, field]))
  const insertStatements = mappings.data.map((mapping) => {
    // 目标字段已通过 validateMapping 校验，因此此处取值失败属于控制面损坏而非可兜底场景。
    const targetField = templateByName.get(mapping.targetField)
    if (!targetField) {
      throw new Error('VALIDATED_TARGET_FIELD_NOT_FOUND')
    }
    return context.env.DB.prepare(
      `INSERT INTO field_mappings
        (id, template_id, source_field, target_field, target_type, required, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      version.template_id,
      mapping.sourceField,
      mapping.targetField,
      targetField.type,
      targetField.required ? 1 : 0,
      now,
    )
  })

  // D1 batch 原子替换模板映射并推进当前数据集版本状态，避免读取到半套映射。
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM field_mappings WHERE template_id = ?').bind(
      version.template_id,
    ),
    ...insertStatements,
    context.env.DB.prepare(
      "UPDATE dataset_versions SET validation_status = 'mapped' WHERE id = ?",
    ).bind(context.req.param('versionId')),
  ])

  return context.json({ status: 'mapped' as const, mappingCount: mappings.data.length })
})

datasetRoutes.get('/:id', async (context) => {
  const dataset = await context.env.DB.prepare(
    'SELECT id, template_id, name, created_at FROM datasets WHERE id = ?',
  )
    .bind(context.req.param('id'))
    .first()
  if (!dataset) {
    return context.json({ code: 'DATASET_NOT_FOUND', message: '数据集不存在' }, 404)
  }

  const versions = await context.env.DB.prepare(
    `SELECT id, source_object_key, schema_object_key, error_object_key, file_type,
            selected_sheet, csv_encoding, csv_delimiter, row_count, column_count,
            validation_status, created_at
     FROM dataset_versions WHERE dataset_id = ? ORDER BY created_at DESC`,
  )
    .bind(context.req.param('id'))
    .all()
  return context.json({ ...dataset, versions: versions.results })
})

async function saveInspection(
  env: Env['Bindings'],
  versionId: string,
  datasetId: string,
  inspection: {
    rowCount: number
    columnCount: number
    sheets: string[]
    sourceFields: string[]
  },
  options: { encoding?: string; delimiter?: string; selectedSheet?: string },
) {
  const schemaObjectKey = `data-analyze/datasets/${datasetId}/${versionId}/schema/inspection.json`
  await env.DATA_BUCKET.put(schemaObjectKey, JSON.stringify(inspection), {
    httpMetadata: { contentType: 'application/json' },
  })
  await env.DB.prepare(
    `UPDATE dataset_versions
     SET schema_object_key = ?, error_object_key = NULL, selected_sheet = ?,
         csv_encoding = ?, csv_delimiter = ?, row_count = ?, column_count = ?,
         validation_status = 'inspected'
     WHERE id = ?`,
  )
    .bind(
      schemaObjectKey,
      options.selectedSheet ?? null,
      options.encoding ?? null,
      options.delimiter ?? null,
      inspection.rowCount,
      inspection.columnCount,
      versionId,
    )
    .run()

  return Response.json({ status: 'inspected', inspection })
}

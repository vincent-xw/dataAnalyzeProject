import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'

export const analysisTemplates = sqliteTable('analysis_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  inputSchemaJson: text('input_schema_json', { mode: 'json' }).notNull(),
  processingPromptVersionId: text('processing_prompt_version_id'),
  reportingPromptVersionId: text('reporting_prompt_version_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const promptVersions = sqliteTable(
  'prompt_versions',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => analysisTemplates.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['processing', 'reporting'] }).notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('prompt_versions_template_type_version_unique').on(
      table.templateId,
      table.type,
      table.version,
    ),
  ],
)

export const datasets = sqliteTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => analysisTemplates.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('datasets_template_created_at_idx').on(table.templateId, table.createdAt)],
)

export const datasetVersions = sqliteTable(
  'dataset_versions',
  {
    id: text('id').primaryKey(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'restrict' }),
    sourceObjectKey: text('source_object_key').notNull().unique(),
    schemaObjectKey: text('schema_object_key'),
    errorObjectKey: text('error_object_key'),
    fileType: text('file_type', { enum: ['csv', 'xlsx'] }).notNull(),
    selectedSheet: text('selected_sheet'),
    csvEncoding: text('csv_encoding', { enum: ['utf-8', 'utf-8-bom', 'gb18030'] }),
    csvDelimiter: text('csv_delimiter', { enum: [',', '\t', ';'] }),
    rowCount: integer('row_count'),
    columnCount: integer('column_count'),
    validationStatus: text('validation_status', {
      enum: ['uploaded', 'awaiting_sheet', 'inspected', 'invalid', 'mapped'],
    }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('dataset_versions_dataset_created_at_idx').on(table.datasetId, table.createdAt)],
)

export const fieldMappings = sqliteTable(
  'field_mappings',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => analysisTemplates.id, { onDelete: 'restrict' }),
    sourceField: text('source_field').notNull(),
    targetField: text('target_field').notNull(),
    targetType: text('target_type', {
      enum: ['string', 'number', 'boolean', 'date'],
    }).notNull(),
    required: integer('required', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('field_mappings_template_source_unique').on(table.templateId, table.sourceField),
    uniqueIndex('field_mappings_template_target_unique').on(table.templateId, table.targetField),
  ],
)

export const scripts = sqliteTable(
  'scripts',
  {
    id: text('id').notNull(),
    version: text('version').notNull(),
    metadataJson: text('metadata_json').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('scripts_id_version_unique').on(table.id, table.version)],
)

export const executionPlans = sqliteTable(
  'execution_plans',
  {
    id: text('id').primaryKey(),
    datasetVersionId: text('dataset_version_id')
      .notNull()
      .references(() => datasetVersions.id, { onDelete: 'restrict' }),
    modelName: text('model_name').notNull(),
    promptVersionId: text('prompt_version_id')
      .notNull()
      .references(() => promptVersions.id, { onDelete: 'restrict' }),
    userRequirement: text('user_requirement').notNull(),
    decisionJson: text('decision_json').notNull(),
    scriptId: text('script_id'),
    scriptVersion: text('script_version'),
    parametersJson: text('parameters_json'),
    confirmationStatus: text('confirmation_status', {
      enum: ['pending', 'confirmed'],
    }).notNull(),
    confirmedAt: text('confirmed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('execution_plans_dataset_version_created_at_idx').on(table.datasetVersionId, table.createdAt)],
)

export const processingTasks = sqliteTable(
  'processing_tasks',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .unique()
      .references(() => executionPlans.id, { onDelete: 'restrict' }),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] }).notNull(),
    resultObjectKey: text('result_object_key'),
    resultSchemaObjectKey: text('result_schema_object_key'),
    resultSummaryObjectKey: text('result_summary_object_key'),
    errorObjectKey: text('error_object_key'),
    retryCount: integer('retry_count').notNull(),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('processing_tasks_status_created_at_idx').on(table.status, table.createdAt)],
)

export const ProcessingTaskInsertSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('queued'),
  })
  .strict()

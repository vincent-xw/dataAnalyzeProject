import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

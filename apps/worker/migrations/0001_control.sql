PRAGMA foreign_keys = ON;

CREATE TABLE `analysis_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL,
  `input_schema_json` text NOT NULL,
  `processing_prompt_version_id` text,
  `reporting_prompt_version_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `prompt_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('processing', 'reporting')),
  `version` integer NOT NULL CHECK (`version` > 0),
  `content` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `analysis_templates`(`id`) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX `prompt_versions_template_type_version_unique`
  ON `prompt_versions` (`template_id`, `type`, `version`);

CREATE TABLE `datasets` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `analysis_templates`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `datasets_template_created_at_idx`
  ON `datasets` (`template_id`, `created_at`);

CREATE TABLE `dataset_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `dataset_id` text NOT NULL,
  `source_object_key` text NOT NULL UNIQUE,
  `schema_object_key` text,
  `error_object_key` text,
  `file_type` text NOT NULL CHECK (`file_type` IN ('csv', 'xlsx')),
  `selected_sheet` text,
  `csv_encoding` text CHECK (`csv_encoding` IN ('utf-8', 'utf-8-bom', 'gb18030')),
  `csv_delimiter` text CHECK (`csv_delimiter` IN (',', char(9), ';')),
  `row_count` integer,
  `column_count` integer,
  `validation_status` text NOT NULL CHECK (
    `validation_status` IN ('uploaded', 'awaiting_sheet', 'inspected', 'invalid', 'mapped')
  ),
  `created_at` text NOT NULL,
  FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `dataset_versions_dataset_created_at_idx`
  ON `dataset_versions` (`dataset_id`, `created_at`);

CREATE TABLE `field_mappings` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `source_field` text NOT NULL,
  `target_field` text NOT NULL,
  `target_type` text NOT NULL CHECK (`target_type` IN ('string', 'number', 'boolean', 'date')),
  `required` integer NOT NULL CHECK (`required` IN (0, 1)),
  `created_at` text NOT NULL,
  FOREIGN KEY (`template_id`) REFERENCES `analysis_templates`(`id`) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX `field_mappings_template_source_unique`
  ON `field_mappings` (`template_id`, `source_field`);

CREATE UNIQUE INDEX `field_mappings_template_target_unique`
  ON `field_mappings` (`template_id`, `target_field`);

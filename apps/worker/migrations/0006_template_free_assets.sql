PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS report_versions;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS processing_tasks;
DROP TABLE IF EXISTS execution_plans;
DROP TABLE IF EXISTS field_mappings;
DROP TABLE IF EXISTS dataset_versions;
DROP TABLE IF EXISTS datasets;
DROP TABLE IF EXISTS prompt_versions;
DROP TABLE IF EXISTS data_assets;
DROP TABLE IF EXISTS analysis_templates;

CREATE TABLE data_assets (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source', 'derived')),
  name text NOT NULL,
  description text,
  tags_json text NOT NULL,
  data_object_key text NOT NULL UNIQUE,
  schema_object_key text NOT NULL UNIQUE,
  preview_object_key text,
  row_count integer NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'processing', 'failed')),
  created_by text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE INDEX data_assets_status_created_at_idx ON data_assets(status, created_at DESC);

PRAGMA foreign_keys = ON;

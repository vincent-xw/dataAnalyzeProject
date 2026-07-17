PRAGMA foreign_keys = ON;

-- 旧映射按模板共享，会错误覆盖同模板下其他上传版本；旧版本必须重新映射。
UPDATE dataset_versions SET validation_status = 'inspected' WHERE validation_status = 'mapped';

DROP INDEX field_mappings_template_source_unique;
DROP INDEX field_mappings_template_target_unique;
DROP TABLE field_mappings;

CREATE TABLE field_mappings (
  id text PRIMARY KEY NOT NULL,
  dataset_version_id text NOT NULL,
  source_field text NOT NULL,
  target_field text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('string', 'number', 'boolean', 'date')),
  required integer NOT NULL CHECK (required IN (0, 1)),
  created_at text NOT NULL,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX field_mappings_version_source_unique
  ON field_mappings(dataset_version_id, source_field);
CREATE UNIQUE INDEX field_mappings_version_target_unique
  ON field_mappings(dataset_version_id, target_field);

ALTER TABLE execution_plans ADD COLUMN execution_mode text NOT NULL DEFAULT 'script'
  CHECK (execution_mode IN ('baseline', 'script'));

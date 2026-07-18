PRAGMA foreign_keys = ON;

CREATE TABLE data_assets (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source', 'derived')),
  template_id text NOT NULL,
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
  updated_at text NOT NULL,
  FOREIGN KEY (template_id) REFERENCES analysis_templates(id) ON DELETE RESTRICT
);

CREATE INDEX data_assets_template_created_at_idx ON data_assets(template_id, created_at DESC);
CREATE INDEX data_assets_status_created_at_idx ON data_assets(status, created_at DESC);

-- 历史执行计划不含操作者信息，仅用于迁移期兼容；新建计划必须显式写入真实 Access 邮箱。
ALTER TABLE execution_plans ADD COLUMN created_by text NOT NULL DEFAULT 'legacy-system';

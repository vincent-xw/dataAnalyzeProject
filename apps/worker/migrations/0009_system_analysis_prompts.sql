CREATE TABLE system_prompt_versions (
  id text PRIMARY KEY NOT NULL,
  prompt_key text NOT NULL,
  version integer NOT NULL,
  source text NOT NULL CHECK (source IN ('default', 'manual')),
  content text NOT NULL,
  created_by text NOT NULL,
  created_at text NOT NULL,
  UNIQUE (prompt_key, version)
);
CREATE TABLE system_prompt_settings (
  prompt_key text PRIMARY KEY NOT NULL,
  active_version_id text NOT NULL REFERENCES system_prompt_versions(id) ON DELETE RESTRICT,
  updated_at text NOT NULL
);
ALTER TABLE analyses ADD COLUMN prompt_version_id text REFERENCES system_prompt_versions(id);
INSERT INTO system_prompt_versions (id, prompt_key, version, source, content, created_by, created_at) VALUES (
  '00000000-0000-4000-8000-000000000009', 'analysis_rules', 1, 'default',
  '你是数据分析规则助手。只返回一个 JSON 对象，严格符合：{"title":"字符串","description":"字符串","filters":[],"widgets":[{"id":"唯一字符串","type":"bar|line|pie","title":"字符串","dataset":"result","dimension":"输入 fields 中的 name","metric":"输入 fields 中的 name","layout":{"x":0,"y":0,"w":12,"h":5}}]}。只能使用输入 fields 的 name，不得使用 sourceLabel。不得生成 report、charts、xField、yField、angleField、colorField、seriesField、count、aggregation。每个图表必须使用一个已有数值字段作为 metric；当前不支持多系列图、计数聚合或跨表关联。只输出 JSON，不要 Markdown 或解释。',
  'system', datetime('now')
);
INSERT INTO system_prompt_settings (prompt_key, active_version_id, updated_at) VALUES ('analysis_rules', '00000000-0000-4000-8000-000000000009', datetime('now'));

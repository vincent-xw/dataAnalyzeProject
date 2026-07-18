CREATE TABLE analyses (
  id text PRIMARY KEY NOT NULL,
  asset_id text NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
  requirement text NOT NULL,
  title text,
  config_json text,
  status text NOT NULL CHECK (status IN ('ready', 'failed')),
  failure_reason text,
  created_by text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX analyses_asset_created_at_idx ON analyses(asset_id, created_at DESC);

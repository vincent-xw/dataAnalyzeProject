CREATE TABLE analysis_data_assets (
  analysis_id text NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES data_assets(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary', 'reference')),
  PRIMARY KEY (analysis_id, asset_id)
);
CREATE UNIQUE INDEX analysis_data_assets_primary_unique ON analysis_data_assets(analysis_id) WHERE role = 'primary';
INSERT INTO analysis_data_assets (analysis_id, asset_id, role)
SELECT id, asset_id, 'primary' FROM analyses;
DROP INDEX analyses_asset_created_at_idx;
ALTER TABLE analyses DROP COLUMN asset_id;

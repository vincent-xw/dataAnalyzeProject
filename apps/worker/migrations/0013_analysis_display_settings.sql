CREATE TABLE system_analysis_display_settings (
  setting_key text PRIMARY KEY NOT NULL,
  charts_per_row integer NOT NULL CHECK (charts_per_row IN (1, 2, 3)),
  default_row_height integer NOT NULL CHECK (default_row_height BETWEEN 240 AND 800),
  updated_by text NOT NULL,
  updated_at text NOT NULL
);

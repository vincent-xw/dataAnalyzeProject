import type { Env } from '../../index'

export const ANALYSIS_PROMPT_KEY = 'analysis_rules'
export type AnalysisDisplaySettings = { chartsPerRow: 1 | 2 | 3; defaultRowHeight: number }
const DEFAULT_ANALYSIS_DISPLAY_SETTINGS: AnalysisDisplaySettings = { chartsPerRow: 2, defaultRowHeight: 400 }
type PromptRow = { id: string; version: number; source: 'default' | 'manual'; content: string; created_by: string; created_at: string }
export class SystemPromptService {
  constructor(private readonly env: Env['Bindings']) {}
  async current() { return this.env.DB.prepare(`SELECT v.* FROM system_prompt_settings s JOIN system_prompt_versions v ON v.id=s.active_version_id WHERE s.prompt_key=?`).bind(ANALYSIS_PROMPT_KEY).first<PromptRow>() }
  async versions() { const rows = await this.env.DB.prepare('SELECT * FROM system_prompt_versions WHERE prompt_key=? ORDER BY version DESC').bind(ANALYSIS_PROMPT_KEY).all<PromptRow>(); return rows.results }
  async save(content: string, createdBy: string, source: 'default' | 'manual' = 'manual') { const next = await this.env.DB.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM system_prompt_versions WHERE prompt_key=?').bind(ANALYSIS_PROMPT_KEY).first<{ version: number }>(); const id = crypto.randomUUID(); const now = new Date().toISOString(); await this.env.DB.batch([this.env.DB.prepare('INSERT INTO system_prompt_versions (id,prompt_key,version,source,content,created_by,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, ANALYSIS_PROMPT_KEY, next?.version || 1, source, content, createdBy, now), this.env.DB.prepare('UPDATE system_prompt_settings SET active_version_id=?, updated_at=? WHERE prompt_key=?').bind(id, now, ANALYSIS_PROMPT_KEY)]); return this.current() }
  async activate(id: string) { const exists = await this.env.DB.prepare('SELECT id FROM system_prompt_versions WHERE id=? AND prompt_key=?').bind(id, ANALYSIS_PROMPT_KEY).first(); if (!exists) return null; await this.env.DB.prepare('UPDATE system_prompt_settings SET active_version_id=?, updated_at=? WHERE prompt_key=?').bind(id, new Date().toISOString(), ANALYSIS_PROMPT_KEY).run(); return this.current() }
  async restoreDefault() { const defaultRow = await this.env.DB.prepare('SELECT content FROM system_prompt_versions WHERE prompt_key=? AND source=\'default\' ORDER BY version DESC LIMIT 1').bind(ANALYSIS_PROMPT_KEY).first<{ content: string }>(); if (!defaultRow) throw new Error('DEFAULT_PROMPT_MISSING'); return this.save(defaultRow.content, 'system', 'default') }
}

export class AnalysisDisplaySettingsService {
  constructor(private readonly env: Env['Bindings']) {}

  async current(): Promise<AnalysisDisplaySettings> {
    const row = await this.env.DB.prepare('SELECT charts_per_row, default_row_height FROM system_analysis_display_settings WHERE setting_key=?').bind('default').first<{ charts_per_row: number; default_row_height: number }>()
    return row ? { chartsPerRow: row.charts_per_row as AnalysisDisplaySettings['chartsPerRow'], defaultRowHeight: row.default_row_height } : DEFAULT_ANALYSIS_DISPLAY_SETTINGS
  }

  async save(settings: AnalysisDisplaySettings, updatedBy: string) {
    await this.env.DB.prepare(`INSERT INTO system_analysis_display_settings (setting_key, charts_per_row, default_row_height, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET charts_per_row=excluded.charts_per_row, default_row_height=excluded.default_row_height, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .bind('default', settings.chartsPerRow, settings.defaultRowHeight, updatedBy, new Date().toISOString()).run()
    return this.current()
  }
}

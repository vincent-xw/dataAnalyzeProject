import { useEffect, useSyncExternalStore } from 'react'

import { apiRequest } from '../../api/client'

export type AnalysisDisplaySettings = {
  chartsPerRow: 1 | 2 | 3
  defaultRowHeight: number
}

const defaultSettings: AnalysisDisplaySettings = { chartsPerRow: 2, defaultRowHeight: 400 }
let settings = defaultSettings
const listeners = new Set<() => void>()

function setSettings(next: AnalysisDisplaySettings) {
  settings = next
  listeners.forEach((listener) => listener())
}

export async function loadAnalysisDisplaySettings() {
  setSettings(await apiRequest<AnalysisDisplaySettings>('/api/settings/analysis-display'))
}

export async function updateAnalysisDisplaySettings(next: AnalysisDisplaySettings) {
  setSettings(await apiRequest<AnalysisDisplaySettings>('/api/settings/analysis-display', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }))
}

export function useAnalysisDisplaySettings() {
  useEffect(() => { void loadAnalysisDisplaySettings().catch(() => undefined) }, [])
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => settings,
    () => defaultSettings,
  )
}

import type { FieldMapping } from '@data-analyze/contracts'

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`API_REQUEST_FAILED_${status}`)
  }
}
/**
 * 未配置独立 API 域名时使用同源 `/api` 路径，便于 Pages 自定义域路由到 Worker。
 */
function resolveApiUrl(path: string) {
  return configuredApiBaseUrl ? `${configuredApiBaseUrl}${path}` : path
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(path), init)
  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new ApiError(response.status, payload)
  }
  return payload as T
}

export type FieldMappingSaveResult = {
  status: 'mapped'
  mappingCount: number
  baselineTaskId: string
}

export type DataAsset = {
  id: string
  kind: 'source' | 'derived'
  templateId: string
  templateName: string
  name: string
  description: string | null
  tags: string[]
  dataObjectKey: string
  schemaObjectKey: string
  rowCount: number
  status: 'ready' | 'processing' | 'failed'
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DataAssetPreview = { rowCount: number; rows: Array<Record<string, unknown>> }

export function saveFieldMapping(versionId: string, mappings: FieldMapping[]) {
  return apiRequest<FieldMappingSaveResult>(
    `/api/datasets/${versionId}/mapping`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mappings),
    },
  )
}

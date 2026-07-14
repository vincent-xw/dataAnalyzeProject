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
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new ApiError(response.status, payload)
  }
  return payload as T
}

export function saveFieldMapping(versionId: string, mappings: FieldMapping[]) {
  return apiRequest<{ status: 'mapped'; mappingCount: number }>(
    `/api/datasets/${versionId}/mapping`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mappings),
    },
  )
}

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

export type DataAsset = {
  id: string
  kind: 'source' | 'derived'
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
export type AnalysisFailureGuidance = { summary: string; suggestion: string; revisedRequirement: string }
export type AnalysisSummary = { id: string; requirement: string; title: string | null; status: 'ready' | 'failed'; failureReason: string | null; guidance: AnalysisFailureGuidance | null; createdAt: string; assets?: Array<{ id: string; name: string; role: 'primary' | 'reference' }> }
export type AnalysisPage = { items: AnalysisSummary[]; total: number; page: number; pageSize: number }

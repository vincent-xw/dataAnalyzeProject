export const MAX_FILE_SIZE = 10 * 1024 * 1024

export type SupportedFileType = 'csv' | 'xlsx'

type UploadMetadata = {
  contentLength: number
  fileName: string
  fileType: SupportedFileType
  templateId: string
}

export type SourceInspectionMetadata = {
  fileName: string
  fileType: SupportedFileType
}

export class UploadRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 413 | 415,
  ) {
    super(message)
  }
}

/** 自定义请求头仅允许 ISO-8859-1，前端用 encodeURIComponent 传递文件名。 */
export function decodeUploadHeader(value: string, headerName: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new UploadRequestError('INVALID_UPLOAD_HEADERS', `${headerName} 编码无效`, 400)
  }
}

/**
 * 严格校验上传元数据。文件后缀与 MIME 必须同时匹配，避免依赖单一客户端声明。
 */
export function parseUploadMetadata(headers: Headers): UploadMetadata {
  const contentLengthHeader = headers.get('content-length')
  const encodedFileName = headers.get('x-file-name')
  const templateId = headers.get('x-template-id')
  const contentType = headers.get('content-type')?.split(';', 1)[0]

  if (!contentLengthHeader || !encodedFileName || !templateId) {
    throw new UploadRequestError('INVALID_UPLOAD_HEADERS', '缺少上传所需请求头', 400)
  }
  const fileName = decodeUploadHeader(encodedFileName, '文件名')

  const contentLength = Number(contentLengthHeader)
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new UploadRequestError('INVALID_CONTENT_LENGTH', '文件大小必须是正整数', 400)
  }
  if (contentLength > MAX_FILE_SIZE) {
    throw new UploadRequestError('FILE_TOO_LARGE', '文件不能超过 10 MB', 413)
  }

  let fileType: SupportedFileType
  if (fileName.toLowerCase().endsWith('.csv') && contentType === 'text/csv') {
    fileType = 'csv'
  } else if (
    fileName.toLowerCase().endsWith('.xlsx') &&
    contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    fileType = 'xlsx'
  } else {
    throw new UploadRequestError('UNSUPPORTED_FILE_TYPE', '仅支持 CSV 和 XLSX 文件', 415)
  }

  return { contentLength, fileName, fileType, templateId }
}

export function parseSourceInspectionMetadata(headers: Headers): SourceInspectionMetadata {
  const encodedFileName = headers.get('x-file-name')
  const contentType = headers.get('content-type')?.split(';', 1)[0]
  if (!encodedFileName) {
    throw new UploadRequestError('INVALID_UPLOAD_HEADERS', '缺少表头检查所需请求头', 400)
  }
  const fileName = decodeUploadHeader(encodedFileName, '文件名')
  let fileType: SupportedFileType
  if (fileName.toLowerCase().endsWith('.csv') && contentType === 'text/csv') fileType = 'csv'
  else if (fileName.toLowerCase().endsWith('.xlsx') && contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') fileType = 'xlsx'
  else throw new UploadRequestError('UNSUPPORTED_FILE_TYPE', '仅支持 CSV 和 XLSX 文件', 415)
  // 浏览器不允许前端手动设置 Content-Length，文件大小由读取后的真实请求体校验。
  return { fileName, fileType }
}

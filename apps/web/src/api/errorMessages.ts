/**
 * 错误信息中文化映射表
 * 将后端错误码/HTTP 状态码转换为用户友好的中文提示
 */

const ERROR_MESSAGE_MAP: Record<string, string> = {
  // 后端 Fastify 错误码
  FST_ERR_CTP_EMPTY_JSON_BODY: '请求格式错误，请重试',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: '请求格式不支持',
  FST_ERR_CTP_BODY_TOO_LARGE: '请求内容超出大小限制',

  // 认证错误
  Unauthorized: '登录已过期，请重新登录',
  UNAUTHORIZED: '登录已过期，请重新登录',
  TOKEN_EXPIRED: '登录已过期，请重新登录',
  TOKEN_INVALID: '登录凭证无效，请重新登录',
  INVALID_CREDENTIALS: '用户名或密码错误',

  // 业务错误码
  NOT_FOUND: '请求的资源不存在',
  BAD_REQUEST: '请求参数错误',
  RATE_LIMITED: '请求过于频繁，请稍后重试',
  REAL_PROVIDER_NOT_CONFIGURED: '请先配置真实的 OCR/LLM 提供商',
  PROVIDER_NOT_FOUND: '提供商配置不存在',
  PROVIDER_SAVE_NOT_SUPPORTED: '当前不支持保存提供商配置',
  JOB_NOT_FOUND: '识别任务不存在',
  WRITEBACK_NOT_READY: '回写条件未满足',
  WRITEBACK_ALREADY_RUNNING_OR_COMPLETED: '回写任务已在执行中或已完成',
  SOURCE_FILE_NOT_FOUND: '源文件不存在',
  STORED_FILE_NOT_FOUND: '存储文件不存在',
  FILE_TOO_LARGE: '文件超出大小限制',
  FILE_CHECKSUM_MISMATCH: '文件校验不匹配，请重新上传',
  EVALUATION_DATASET_NOT_DEIDENTIFIED: '评测数据集未脱敏',
};

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: '请求参数错误',
  401: '登录已过期，请重新登录',
  403: '没有权限执行此操作',
  404: '请求的资源不存在',
  408: '请求超时，请重试',
  409: '操作冲突，请刷新后重试',
  413: '上传内容超出大小限制',
  429: '请求过于频繁，请稍后重试',
  500: '服务器内部错误，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务请求超时，请稍后重试',
};

/**
 * 根据错误信息获取中文提示
 * @param body 服务端响应体
 * @param status HTTP 状态码
 * @returns 用户友好的中文错误信息
 */
export function getChineseErrorMessage(body: unknown, status?: number): string {
  // 1. 尝试从服务端响应体提取错误码
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;

    // 优先匹配 error 字段（后端统一错误码）
    if (typeof record.error === 'string') {
      const mapped = ERROR_MESSAGE_MAP[record.error];
      if (mapped) return mapped;
    }

    // 其次匹配 message 字段（部分接口返回中文 message）
    if (typeof record.message === 'string') {
      const mapped = ERROR_MESSAGE_MAP[record.message];
      if (mapped) return mapped;
    }
  }

  // 2. 匹配 HTTP 状态码
  if (status && HTTP_STATUS_MESSAGES[status]) {
    return HTTP_STATUS_MESSAGES[status];
  }

  // 3. 兜底
  return '操作失败，请稍后重试';
}

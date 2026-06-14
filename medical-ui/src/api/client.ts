import { toast } from '../components/GlobalToast';
import { getChineseErrorMessage } from './errorMessages';

const API_BASE = '/api';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

// 401 去重锁 — 多个请求同时 401 时，只执行一次跳转
let isRedirectingToLogin = false;

export function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

export function setToken(token: string) {
  localStorage.setItem('accessToken', token);
}

export function clearToken() {
  localStorage.removeItem('accessToken');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public userMessage: string,
    message?: string
  ) {
    super(message || `API Error ${status}`);
  }
}

export class NetworkError extends Error {
  constructor(message = '网络连接失败，请检查网络后重试') {
    super(message);
    this.name = 'NetworkError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function handle401Redirect() {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  clearToken();
  window.location.href = '/login';
  // 5 秒后重置 flag，避免页面加载后锁死
  setTimeout(() => {
    isRedirectingToLogin = false;
  }, 5000);
}

/* ------------------------------------------------------------------ */
/*  Token 静默续期                                                     */
/* ------------------------------------------------------------------ */

let refreshPromise: Promise<string | null> | null = null;

/**
 * 尝试用当前 token 换取新 token。
 * 并发请求时只发一次 refresh，其他请求等待同一 Promise。
 * 返回新 token 或 null（续期失败）。
 */
async function tryRefreshToken(): Promise<string | null> {
  // 已有 refresh 请求在进行中，复用它
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const token = getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data?.accessToken) {
        setToken(data.accessToken);
        return data.accessToken as string;
      }
      return null;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // POST/DELETE/PUT 无 body 自动补 {}
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(method) && options.body === undefined) {
    options.body = JSON.stringify({});
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    } catch (error) {
      lastError = error;
      // Network errors (DNS failure, connection refused, offline, AbortError)
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      toast.error('网络连接失败，请检查网络后重试');
      throw new NetworkError();
    }

    if (res.status === 401) {
      // 尝试静默续期（非重试的请求才触发，避免递归）
      if (attempt === 0) {
        const newToken = await tryRefreshToken();
        if (newToken) {
          // 续期成功，用新 token 重试当前请求
          headers['Authorization'] = `Bearer ${newToken}`;
          continue;
        }
      }
      // 续期失败或已经重试过，跳转登录页
      handle401Redirect();
      throw new ApiError(401, null, '登录已过期，请重新登录', 'Unauthorized');
    }

    if (!res.ok) {
      // Retry on transient server/network errors
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const userMessage = getChineseErrorMessage(body, res.status);
      if (res.status !== 401) {
        toast.error(userMessage);
      }
      throw new ApiError(res.status, body, userMessage);
    }

    // Handle binary responses
    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      return res as unknown as T;
    }

    return res.json();
  }

  // Should never reach here, but TypeScript needs it
  throw lastError instanceof Error ? lastError : new NetworkError();
}

/** Convert a Uint8Array to base64 string without stack overflow */
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const chunk = uint8Array.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''));
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: { id: string; email: string; displayName: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    ),
  logout: () =>
    request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  refresh: () =>
    request<{ accessToken: string; tokenType: string }>('/auth/refresh', { method: 'POST' }),
};

// Jobs
export const jobsApi = {
  list: (limit = 50) =>
    request<{ items: import('./types').RecognitionJob[] }>(`/jobs?limit=${limit}`),
  listPaginated: (params?: { page?: number; pageSize?: number; status?: string; schemaKey?: string; search?: string }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.status && params.status !== 'all') p.set('status', params.status);
    if (params?.schemaKey) p.set('schemaKey', params.schemaKey);
    if (params?.search) p.set('search', params.search);
    const qs = p.toString();
    return request<{ items: import('./types').RecognitionJob[]; total: number; page: number; pageSize: number }>(
      `/jobs${qs ? `?${qs}` : ''}`
    );
  },
  get: (id: string) =>
    request<import('./types').RecognitionJob>(`/jobs/${id}`),
  create: (body: { schemaKey: string; sourceFileId?: string; schemaVersionId?: string; providerConfig?: import('./types').ProviderConfigMap }) =>
    request<import('./types').RecognitionJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rerun: (id: string) =>
    request<import('./types').RecognitionJob>(`/jobs/${id}/rerun`, { method: 'POST' }),
  delete: (id: string) =>
    request<void>(`/jobs/${id}`, { method: 'DELETE' }),
  export: (id: string) =>
    request<Record<string, unknown>>(`/jobs/${id}/export`),
};

// Results
export const resultsApi = {
  getByJob: (jobId: string) =>
    request<import('./types').RecognitionResult>(`/results/${jobId}`),
};

// Files
export const filesApi = {
  upload: async (file: File): Promise<import('./types').StoredFile> => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`文件 ${file.name} 超过 20MB 限制`);
    }

    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Calculate SHA256 (crypto.subtle only available in secure contexts: HTTPS/localhost)
    let checksumSha256 = '';
    try {
      if (crypto?.subtle?.digest) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        checksumSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      // crypto.subtle unavailable (non-HTTPS), skip checksum — server will still accept the file
    }

    // Convert to base64 using chunked approach to avoid stack overflow
    const base64 = uint8ArrayToBase64(uint8Array);

    return request<import('./types').StoredFile>('/files', {
      method: 'POST',
      body: JSON.stringify({
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64: base64,
        ...(checksumSha256 ? { checksumSha256 } : {}),
      }),
    });
  },
  /** Check if a file exists by ID */
  exists: async (id: string): Promise<boolean> => {
    try {
      await request<unknown>(`/files/${id}`);
      return true;
    } catch {
      return false;
    }
  },
  downloadUrl: (id: string) => `${API_BASE}/files/${id}/content`,
};

// Schemas
export const schemasApi = {
  list: () =>
    request<{ items: import('./types').SchemaVersion[] }>('/schemas'),
  listDrafts: () =>
    request<import('./types').SchemaDraft[]>('/schemas/drafts'),
  createDraft: (body: { schemaKey: string; displayName: string; definition: import('./types').SchemaDefinition }) =>
    request<{ draft: import('./types').SchemaDraft }>('/schemas/drafts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  validateDraft: (id: string, definition: import('./types').SchemaDefinition) =>
    request<{ validation: import('./types').ValidationReport }>(`/schemas/drafts/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify({ definition }),
    }),
  publishDraft: (id: string, changelog?: string) =>
    request<{ version: import('./types').SchemaVersion }>(`/schemas/drafts/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ changelog: changelog || '' }),
    }),
  deactivateVersion: (id: string) =>
    request<{ version: import('./types').SchemaVersion }>(`/schemas/versions/${id}/deactivate`, {
      method: 'POST',
    }),
  activateVersion: (id: string) =>
    request<{ version: import('./types').SchemaVersion }>(`/schemas/versions/${id}/activate`, {
      method: 'POST',
    }),
  rollbackVersion: (id: string) =>
    request<{ version: import('./types').SchemaVersion }>(`/schemas/versions/${id}/rollback`, {
      method: 'POST',
    }),
};

// Providers
export const providersApi = {
  list: () =>
    request<{ items: import('./types').ProviderConfig[] }>('/providers'),
  create: (body: { key: string; kind: string; displayName: string; enabled?: boolean; isDefault?: boolean; config?: Record<string, unknown>; secretRefs?: Record<string, string> }) =>
    request<{ provider: import('./types').ProviderConfig }>('/providers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  health: (key: string) =>
    request<{ health: import('./types').ProviderHealth }>(`/providers/${key}/health`, {
      method: 'POST',
    }),
  setDefault: (key: string) =>
    request<{ provider: import('./types').ProviderConfig }>(`/providers/${key}/default`, {
      method: 'POST',
    }),
  update: (key: string, body: Partial<import('./types').ProviderConfigMap>) =>
    request<{ provider: import('./types').ProviderConfig }>(`/providers/${key}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: (key: string) =>
    request<{ deleted: boolean }>(`/providers/${key}`, {
      method: 'DELETE',
    }),
};

// Evaluation
export const evaluationApi = {
  listDatasets: () =>
    request<{ items: import('./types').EvaluationDataset[] }>('/evaluations/datasets'),
  createDataset: (body: { key: string; displayName: string; description?: string; deidentified: boolean }) =>
    request<{ dataset: import('./types').EvaluationDataset }>('/evaluations/datasets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listSamples: (datasetId: string) =>
    request<{ items: import('./types').EvaluationSample[] }>(`/evaluations/datasets/${datasetId}/samples`),
  importSamples: (datasetId: string, samples: import('./types').FieldExtractionMap[]) =>
    request<{ samples: import('./types').EvaluationSample[] }>(
      `/evaluations/datasets/${datasetId}/samples`,
      { method: 'POST', body: JSON.stringify({ samples }) }
    ),
  listRuns: () =>
    request<{ items: import('./types').EvaluationRun[] }>('/evaluations/runs'),
  createRun: (body: { datasetId: string; providerKey: string; schemaKey?: string; sampleLimit?: number }) =>
    request<{ run: import('./types').EvaluationRun }>('/evaluations/runs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getRunMetrics: (runId: string) =>
    request<{ metrics: import('./types').EvaluationMetric[] }>(`/evaluations/runs/${runId}/metrics`),
};

// Feedback
export const feedbackApi = {
  submit: (body: import('./types').FeedbackSubmitRequest) =>
    request<import('./types').FeedbackSubmission>('/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listByJob: (jobId: string) =>
    request<{ items: import('./types').FeedbackSubmission[] }>(`/feedback?jobId=${jobId}`),
  listAll: (params?: { fieldKey?: string; jobId?: string; status?: string; page?: number; pageSize?: number }) => {
    const p = new URLSearchParams();
    if (params?.fieldKey) p.set('fieldKey', params.fieldKey);
    if (params?.jobId) p.set('jobId', params.jobId);
    if (params?.status) p.set('status', params.status);
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    const qs = p.toString();
    return request<{ items: import('./types').FeedbackSubmission[]; total: number; page: number; pageSize: number }>(
      `/feedback/all${qs ? `?${qs}` : ''}`
    );
  },
  getFieldStats: () =>
    request<{ stats: import('./types').FeedbackFieldStat[] }>('/feedback/stats'),
  updateStatus: (id: string, status: 'approved' | 'rejected', reviewNote?: string) =>
    request<import('./types').FeedbackSubmission>(`/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewNote }),
    }),
  batchUpdateStatus: (ids: string[], status: 'approved' | 'rejected') =>
    request<{ updated: number }>('/feedback/batch', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status }),
    }),
};

// Audit
export const auditApi = {
  list: (take = 20) =>
    request<{ items: import('./types').AuditEntry[] }>(`/audit?take=${take}`),
  listPaginated: (params?: { page?: number; pageSize?: number; action?: string; objectType?: string; startDate?: string; endDate?: string }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.action) p.set('action', params.action);
    if (params?.objectType) p.set('objectType', params.objectType);
    if (params?.startDate) p.set('startDate', params.startDate);
    if (params?.endDate) p.set('endDate', params.endDate);
    const qs = p.toString();
    return request<{ items: import('./types').AuditEntry[]; total: number; page: number; pageSize: number }>(
      `/audit${qs ? `?${qs}` : ''}`
    );
  },
  exportCsv: (params?: { action?: string; objectType?: string; startDate?: string; endDate?: string }) => {
    const p = new URLSearchParams();
    if (params?.action) p.set('action', params.action);
    if (params?.objectType) p.set('objectType', params.objectType);
    if (params?.startDate) p.set('startDate', params.startDate);
    if (params?.endDate) p.set('endDate', params.endDate);
    const qs = p.toString();
    return `${API_BASE}/audit/export${qs ? `?${qs}` : ''}`;
  },
};

// Health
export const healthApi = {
  check: () =>
    request<{ status: string; service: string }>('/health'),
};

// Knowledge
export const knowledgeApi = {
  list: (filter?: { fieldKey?: string; kind?: string }) => {
    const params = new URLSearchParams();
    if (filter?.fieldKey) params.set('fieldKey', filter.fieldKey);
    if (filter?.kind) params.set('kind', filter.kind);
    const qs = params.toString();
    return request<{ entries: import('./types').KnowledgeEntry[]; total: number }>(
      `/knowledge${qs ? `?${qs}` : ''}`
    );
  },
  create: (body: Partial<import('./types').KnowledgeEntry>) =>
    request<import('./types').KnowledgeEntry>('/knowledge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<import('./types').KnowledgeEntry>) =>
    request<import('./types').KnowledgeEntry>(`/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    request<void>(`/knowledge/${id}`, { method: 'DELETE' }),
};

// Dashboard Stats
export const statsApi = {
  getDashboard: () =>
    request<import('./types').DashboardStats>('/stats/dashboard'),
  getFieldStats: (schemaKey: string, limit?: number) => {
    const params = new URLSearchParams({ schemaKey });
    if (limit) params.set('limit', String(limit));
    return request<{ stats: import('./types').FieldStatItem[]; total: number }>(`/stats/fields?${params}`);
  },
  getTrendStats: (schemaKey: string, days?: number) => {
    const params = new URLSearchParams({ schemaKey });
    if (days) params.set('days', String(days));
    return request<{ trend: import('./types').TrendDataPoint[] }>(`/stats/trend?${params}`);
  },
};

// Writeback
export const writebackApi = {
  eligible: (limit = 20) =>
    request<{ items: import('./types').WritebackEligibleItem[] }>(`/writeback/eligible?limit=${limit}`),
  execute: (body: { jobId: string; confirmed: true; idempotencyKey?: string }) =>
    request<import('./types').WritebackExecuteResult>('/writeback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  history: (params?: { page?: number; pageSize?: number }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    const qs = p.toString();
    return request<{ items: import('./types').WritebackAttempt[]; total: number; page: number; pageSize: number }>(
      `/writeback/history${qs ? `?${qs}` : ''}`
    );
  },
};

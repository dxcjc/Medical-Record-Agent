const API_BASE = '/api';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getToken(): string | null {
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
    message?: string
  ) {
    super(message || `API Error ${status}`);
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

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError(401, null, 'Unauthorized');
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }

  // Handle binary responses
  const contentType = res.headers.get('content-type');
  if (contentType && !contentType.includes('application/json')) {
    return res as unknown as T;
  }

  return res.json();
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
  create: (body: { schemaKey: string; sourceFileId?: string; schemaVersionId?: string; providerConfig?: Record<string, unknown> }) =>
    request<import('./types').RecognitionJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
    
    // Calculate SHA256
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksumSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Convert to base64 using chunked approach to avoid stack overflow
    const base64 = uint8ArrayToBase64(uint8Array);
    
    return request<import('./types').StoredFile>('/files', {
      method: 'POST',
      body: JSON.stringify({
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64: base64,
        checksumSha256,
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
  createDraft: (body: { schemaKey: string; displayName: string; definition: Record<string, unknown> }) =>
    request<{ draft: import('./types').SchemaDraft }>('/schemas/drafts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  validateDraft: (id: string, definition: Record<string, unknown>) =>
    request<{ validation: Record<string, unknown> }>(`/schemas/drafts/${id}/validate`, {
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
  rollbackVersion: (id: string) =>
    request<{ version: import('./types').SchemaVersion }>(`/schemas/versions/${id}/rollback`, {
      method: 'POST',
    }),
};

// Providers
export const providersApi = {
  list: () =>
    request<{ items: import('./types').ProviderConfig[] }>('/providers'),
  health: (key: string) =>
    request<{ health: import('./types').ProviderHealth }>(`/providers/${key}/health`, {
      method: 'POST',
    }),
  setDefault: (key: string) =>
    request<{ provider: import('./types').ProviderConfig }>(`/providers/${key}/default`, {
      method: 'POST',
    }),
  update: (key: string, body: Record<string, unknown>) =>
    request<{ provider: import('./types').ProviderConfig }>(`/providers/${key}`, {
      method: 'PUT',
      body: JSON.stringify(body),
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
  importSamples: (datasetId: string, samples: Record<string, unknown>[]) =>
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
  submit: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listByJob: (jobId: string) =>
    request<{ items: Record<string, unknown>[] }>(`/feedback?jobId=${jobId}`),
  listAll: (params?: { fieldKey?: string; jobId?: string; page?: number; pageSize?: number }) => {
    const p = new URLSearchParams();
    if (params?.fieldKey) p.set('fieldKey', params.fieldKey);
    if (params?.jobId) p.set('jobId', params.jobId);
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    const qs = p.toString();
    return request<{ items: import('./types').FeedbackSubmission[]; total: number; page: number; pageSize: number }>(
      `/feedback/all${qs ? `?${qs}` : ''}`
    );
  },
  getFieldStats: () =>
    request<{ stats: import('./types').FeedbackFieldStat[] }>('/feedback/stats'),
};

// Audit
export const auditApi = {
  list: (take = 20) =>
    request<{ items: import('./types').AuditEntry[] }>(`/audit?take=${take}`),
  listPaginated: (params?: { page?: number; pageSize?: number; action?: string; objectType?: string }) => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.action) p.set('action', params.action);
    if (params?.objectType) p.set('objectType', params.objectType);
    const qs = p.toString();
    return request<{ items: import('./types').AuditEntry[]; total: number; page: number; pageSize: number }>(
      `/audit${qs ? `?${qs}` : ''}`
    );
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
    request<{ items: Array<Record<string, unknown>> }>(`/writeback/eligible?limit=${limit}`),
  execute: (body: { jobId: string; confirmed: true; idempotencyKey?: string }) =>
    request<Record<string, unknown>>('/writeback', {
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

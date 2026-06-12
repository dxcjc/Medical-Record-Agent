const API_BASE = '/api';

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
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<import('./types').StoredFile>('/files', {
      method: 'POST',
      body: formData,
    });
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
};

// Audit
export const auditApi = {
  list: (take = 20) =>
    request<{ items: import('./types').AuditEntry[] }>(`/audit?take=${take}`),
};

// Health
export const healthApi = {
  check: () =>
    request<{ status: string; service: string }>('/health'),
};

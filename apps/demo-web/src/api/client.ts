export type ApiClientOptions = {
  baseUrl?: string;
  getToken?: () => string | null;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    status?: string;
  };
  permissions: string[];
  roles: string[];
};

export type CreateFileInput = {
  originalName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  contentBase64?: string;
  metadata?: unknown;
};

export type CreateEvaluationRunInput = {
  datasetId: string;
  schemaKey?: string;
  providerKey: string;
  sampleLimit?: number;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

export type FileContentResponse = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function readErrorCode(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const code = (payload as { error?: unknown }).error;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }

  return "API_ERROR";
}

function readFileNameFromDisposition(value: string | null) {
  if (!value) {
    return "medical-record-file";
  }

  const match = /filename="([^"]+)"/.exec(value) ?? /filename=([^;]+)/.exec(value);
  return match?.[1]?.trim() || "medical-record-file";
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");

  function createAuthorizedHeaders(headers?: HeadersInit) {
    const output = new Headers(headers);
    const token = options.getToken?.();

    if (token) {
      output.set("authorization", `Bearer ${token}`);
    }

    return output;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = createAuthorizedHeaders(init.headers);

    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers
    });
    const text = await response.text();
    const payload = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new ApiClientError(response.status, readErrorCode(payload));
    }

    return payload as T;
  }

  async function download(path: string): Promise<FileContentResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: createAuthorizedHeaders()
    });

    if (!response.ok) {
      let payload: unknown;
      try {
        const text = await response.text();
        payload = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        payload = undefined;
      }

      throw new ApiClientError(response.status, readErrorCode(payload));
    }

    return {
      blob: await response.blob(),
      fileName: readFileNameFromDisposition(response.headers.get("content-disposition")),
      mimeType: response.headers.get("content-type") ?? "application/octet-stream"
    };
  }

  return {
    baseUrl,
    login(input: { email: string; password: string }) {
      return request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    health() {
      return request<{ status: string; service: string }>("/health");
    },
    listSchemas() {
      return request<{ items: unknown[] }>("/schemas");
    },
    createSchemaDraft(input: { schemaKey: string; displayName: string; definition: unknown }) {
      return request<unknown>("/schemas/drafts", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    updateSchemaDraft(id: string, input: { definition: unknown }) {
      return request<unknown>(`/schemas/drafts/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(input)
      });
    },
    validateSchemaDraft(id: string, input: { definition: unknown }) {
      return request<unknown>(`/schemas/drafts/${encodeURIComponent(id)}/validate`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    publishSchemaDraft(id: string, changelog: string) {
      return request<unknown>(`/schemas/drafts/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ changelog })
      });
    },
    deactivateSchemaVersion(id: string) {
      return request<unknown>(`/schemas/versions/${encodeURIComponent(id)}/deactivate`, {
        method: "POST"
      });
    },
    rollbackSchemaVersion(id: string) {
      return request<unknown>(`/schemas/versions/${encodeURIComponent(id)}/rollback`, {
        method: "POST"
      });
    },
    compareSchemaVersions(schemaKey: string, input: { left: string; right: string }) {
      const search = new URLSearchParams({
        left: input.left,
        right: input.right
      });

      return request<unknown>(`/schemas/${encodeURIComponent(schemaKey)}/compare?${search.toString()}`);
    },
    listProviders() {
      return request<{ items: unknown[] }>("/providers");
    },
    setDefaultProvider(key: string) {
      return request<unknown>(`/providers/${encodeURIComponent(key)}/default`, {
        method: "POST"
      });
    },
    checkProviderHealth(key: string) {
      return request<unknown>(`/providers/${encodeURIComponent(key)}/health`, {
        method: "POST"
      });
    },
    listEvaluationDatasets() {
      return request<{ items: unknown[] }>("/evaluations/datasets");
    },
    createEvaluationDataset(input: {
      key: string;
      displayName: string;
      description?: string;
      deidentified: boolean;
      metadata?: unknown;
    }) {
      return request<unknown>("/evaluations/datasets", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    importEvaluationSamples(datasetId: string, samples: unknown[]) {
      return request<unknown>(`/evaluations/datasets/${encodeURIComponent(datasetId)}/samples`, {
        method: "POST",
        body: JSON.stringify({ samples })
      });
    },
    listEvaluationRuns(datasetId?: string) {
      const query = datasetId ? `?${new URLSearchParams({ datasetId }).toString()}` : "";

      return request<{ items: unknown[] }>(`/evaluations/runs${query}`);
    },
    createEvaluationRun(input: CreateEvaluationRunInput) {
      return request<unknown>("/evaluations/runs", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    getEvaluationRun(id: string) {
      return request<unknown>(`/evaluations/runs/${encodeURIComponent(id)}`);
    },
    listEvaluationRunMetrics(id: string) {
      return request<unknown>(`/evaluations/runs/${encodeURIComponent(id)}/metrics`);
    },
    createFile(input: CreateFileInput) {
      return request<unknown>("/files", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    getFileContent(id: string) {
      return download(`/files/${encodeURIComponent(id)}/content`);
    },
    createRecognitionJob(input: unknown) {
      return request<unknown>("/jobs", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    getJob(id: string) {
      return request<unknown>(`/jobs/${encodeURIComponent(id)}`);
    },
    getResult(jobId: string) {
      return request<unknown>(`/results/${encodeURIComponent(jobId)}`);
    },
    createFeedback(input: unknown) {
      return request<unknown>("/feedback", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    executeWriteback(input: unknown) {
      return request<unknown>("/writeback", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    listEligibleWritebacks(limit = 20) {
      const search = new URLSearchParams({
        limit: String(limit)
      });

      return request<{ items: unknown[] }>(`/writeback/eligible?${search.toString()}`);
    },
    listAudit() {
      return request<{ items: unknown[] }>("/audit?take=20");
    }
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

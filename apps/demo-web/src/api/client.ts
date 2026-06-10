import type {
  ApiAuditListResponse,
  ApiClientOptions,
  ApiCollectionResponse,
  ApiEvaluationDataset,
  ApiEvaluationMetricsResponse,
  ApiEvaluationRun,
  ApiEvaluationRunResponse,
  ApiEvaluationSamplesResponse,
  ApiFeedbackResponse,
  ApiFileRecord,
  ApiJsonValue,
  ApiProviderHealthResponse,
  ApiProviderItem,
  ApiProviderResponse,
  ApiRequestOptions,
  ApiSchemaCompareResponse,
  ApiSchemaDraftResponse,
  ApiSchemaValidationResponse,
  ApiSchemaVersionResponse,
  ApiWritebackEligibleItem,
  ApiWritebackResponse,
  CreateEvaluationDatasetInput,
  CreateEvaluationRunInput,
  CreateFileInput,
  CreateFeedbackInput,
  CreateRecognitionJobInput,
  ExecuteWritebackInput,
  FileContentResponse,
  HealthResponse,
  ImportEvaluationSampleInput,
  LoginResponse,
  SaveProviderConfigInput
} from "./types";

export type {
  ApiAuditEntry,
  ApiAuditListResponse,
  ApiClientOptions,
  ApiCollectionResponse,
  ApiEvaluationDataset,
  ApiEvaluationMetricsResponse,
  ApiEvaluationMetric,
  ApiEvaluationRun,
  ApiEvaluationRunResponse,
  ApiEvaluationSample,
  ApiEvaluationSamplesResponse,
  ApiFeedbackResponse,
  ApiFileRecord,
  ApiJsonObject,
  ApiJsonValue,
  ApiProviderHealth,
  ApiProviderHealthResponse,
  ApiProviderItem,
  ApiProviderResponse,
  ApiRequestOptions,
  ApiSchemaCompareResponse,
  ApiSchemaDraftResponse,
  ApiSchemaValidationIssue,
  ApiSchemaValidationResponse,
  ApiSchemaVersionResponse,
  ApiWritebackEligibleItem,
  ApiWritebackReadyField,
  ApiWritebackResponse,
  CreateEvaluationDatasetInput,
  CreateEvaluationRunInput,
  CreateFileInput,
  CreateFeedbackInput,
  CreateRecognitionJobInput,
  ExecuteWritebackInput,
  FileContentResponse,
  HealthResponse,
  ImportEvaluationSampleInput,
  LoginResponse,
  SaveProviderConfigInput
} from "./types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(describeApiErrorCode(code));
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

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

export function describeApiErrorCode(code: string) {
  // API 只暴露稳定错误码，前端在这里集中转成用户可理解的中文提示。
  // 这样页面不需要认识每个后端 code，也避免把原始 Error.message 或敏感配置细节直接展示出来。
  const messages: Record<string, string> = {
    API_ERROR: "接口请求失败，请稍后重试。",
    AUTH_INVALID_CREDENTIALS: "账号或密码不正确，请检查后重试。",
    FORBIDDEN: "当前账号没有执行该操作的权限。",
    FILE_CHECKSUM_MISMATCH: "文件校验值不一致，请重新选择病历文件后再上传。",
    FILE_CONTENT_BASE64_INVALID: "文件内容编码无效，请重新选择病历图片或 PDF。",
    FILE_STORAGE_PROVIDER_NOT_CONFIGURED: "文件存储服务未配置，无法保存上传的病历文件。",
    NOT_FOUND: "请求的数据不存在或已被移除。",
    PROVIDER_NOT_FOUND: "未找到指定 Provider，请刷新后重试。",
    SCHEMA_DRAFT_NOT_FOUND: "未找到 Schema 草稿，请刷新列表后重试。",
    SCHEMA_VERSION_NOT_FOUND: "未找到 Schema 版本，请刷新列表后重试。",
    SOURCE_FILE_NOT_FOUND: "未找到已上传的病历文件，请重新上传后再创建识别任务。",
    STORED_FILE_NOT_FOUND: "病历文件在受控存储中不存在，请重新上传后再试。",
    UNAUTHORIZED: "登录状态已失效，请重新登录。"
  };

  return messages[code] ?? code;
}

function readFileNameFromDisposition(value: string | null) {
  if (!value) {
    return "medical-record-file";
  }

  const match = /filename="([^"]+)"/.exec(value) ?? /filename=([^;]+)/.exec(value);
  return match?.[1]?.trim() || "medical-record-file";
}

function withOptionalSignal(signal: AbortSignal | undefined): Pick<RequestInit, "signal"> {
  return signal ? { signal } : {};
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
      credentials: "include",
      headers
    });
    const text = await response.text();
    const payload = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new ApiClientError(response.status, readErrorCode(payload));
    }

    return payload as T;
  }

  async function download(path: string, options: ApiRequestOptions = {}): Promise<FileContentResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: createAuthorizedHeaders(),
      credentials: "include",
      ...withOptionalSignal(options.signal)
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
    logout() {
      return request<{ ok: true }>("/auth/logout", {
        method: "POST"
      });
    },
    health(options: ApiRequestOptions = {}) {
      return request<HealthResponse>("/health", {
        ...withOptionalSignal(options.signal)
      });
    },
    listSchemas(options: ApiRequestOptions = {}) {
      return request<ApiCollectionResponse<ApiSchemaVersionResponse>>("/schemas", {
        ...withOptionalSignal(options.signal)
      });
    },
    createSchemaDraft(input: { schemaKey: string; displayName: string; definition: ApiJsonValue }, options: ApiRequestOptions = {}) {
      return request<ApiSchemaDraftResponse>("/schemas/drafts", {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    updateSchemaDraft(id: string, input: { definition: ApiJsonValue }, options: ApiRequestOptions = {}) {
      return request<ApiSchemaDraftResponse>(`/schemas/drafts/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    validateSchemaDraft(id: string, input: { definition: ApiJsonValue }, options: ApiRequestOptions = {}) {
      return request<ApiSchemaValidationResponse>(`/schemas/drafts/${encodeURIComponent(id)}/validate`, {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    publishSchemaDraft(id: string, changelog: string, options: ApiRequestOptions = {}) {
      return request<ApiSchemaVersionResponse>(`/schemas/drafts/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ changelog }),
        ...withOptionalSignal(options.signal)
      });
    },
    deactivateSchemaVersion(id: string, options: ApiRequestOptions = {}) {
      return request<ApiSchemaVersionResponse>(`/schemas/versions/${encodeURIComponent(id)}/deactivate`, {
        method: "POST",
        ...withOptionalSignal(options.signal)
      });
    },
    rollbackSchemaVersion(id: string, options: ApiRequestOptions = {}) {
      return request<ApiSchemaVersionResponse>(`/schemas/versions/${encodeURIComponent(id)}/rollback`, {
        method: "POST",
        ...withOptionalSignal(options.signal)
      });
    },
    compareSchemaVersions(schemaKey: string, input: { left: string; right: string }, options: ApiRequestOptions = {}) {
      const search = new URLSearchParams({
        left: input.left,
        right: input.right
      });

      return request<ApiSchemaCompareResponse>(`/schemas/${encodeURIComponent(schemaKey)}/compare?${search.toString()}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    listProviders(options: ApiRequestOptions = {}) {
      return request<ApiCollectionResponse<ApiProviderItem>>("/providers", {
        ...withOptionalSignal(options.signal)
      });
    },
    setDefaultProvider(key: string, options: ApiRequestOptions = {}) {
      return request<ApiProviderResponse>(`/providers/${encodeURIComponent(key)}/default`, {
        method: "POST",
        ...withOptionalSignal(options.signal)
      });
    },
    saveProviderConfig(key: string, input: SaveProviderConfigInput, options: ApiRequestOptions = {}) {
      return request<ApiProviderResponse>(`/providers/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    checkProviderHealth(key: string, options: ApiRequestOptions = {}) {
      return request<ApiProviderHealthResponse>(`/providers/${encodeURIComponent(key)}/health`, {
        method: "POST",
        ...withOptionalSignal(options.signal)
      });
    },
    listEvaluationDatasets(options: ApiRequestOptions = {}) {
      return request<ApiCollectionResponse<ApiEvaluationDataset>>("/evaluations/datasets", {
        ...withOptionalSignal(options.signal)
      });
    },
    createEvaluationDataset(input: CreateEvaluationDatasetInput) {
      return request<{ dataset: ApiEvaluationDataset }>("/evaluations/datasets", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    importEvaluationSamples(datasetId: string, samples: ImportEvaluationSampleInput[], options: ApiRequestOptions = {}) {
      return request<ApiEvaluationSamplesResponse>(`/evaluations/datasets/${encodeURIComponent(datasetId)}/samples`, {
        method: "POST",
        body: JSON.stringify({ samples }),
        ...withOptionalSignal(options.signal)
      });
    },
    listEvaluationRuns(datasetId?: string, options: ApiRequestOptions = {}) {
      const query = datasetId ? `?${new URLSearchParams({ datasetId }).toString()}` : "";

      return request<ApiCollectionResponse<ApiEvaluationRun>>(`/evaluations/runs${query}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    createEvaluationRun(input: CreateEvaluationRunInput, options: ApiRequestOptions = {}) {
      return request<ApiEvaluationRunResponse>("/evaluations/runs", {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    getEvaluationRun(id: string, options: ApiRequestOptions = {}) {
      return request<ApiEvaluationRunResponse>(`/evaluations/runs/${encodeURIComponent(id)}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    listEvaluationRunMetrics(id: string, options: ApiRequestOptions = {}) {
      return request<ApiEvaluationMetricsResponse>(`/evaluations/runs/${encodeURIComponent(id)}/metrics`, {
        ...withOptionalSignal(options.signal)
      });
    },
    createFile(input: CreateFileInput, options: ApiRequestOptions = {}) {
      return request<ApiFileRecord>("/files", {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    getFileContent(id: string, options: ApiRequestOptions = {}) {
      return download(`/files/${encodeURIComponent(id)}/content`, options);
    },
    createRecognitionJob(input: CreateRecognitionJobInput, options: ApiRequestOptions = {}) {
      return request<import("./types").ApiRecognitionJob>("/jobs", {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    getJob(id: string, options: ApiRequestOptions = {}) {
      return request<import("./types").ApiRecognitionJob>(`/jobs/${encodeURIComponent(id)}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    getResult(jobId: string, options: ApiRequestOptions = {}) {
      return request<import("./types").ApiRecognitionResult>(`/results/${encodeURIComponent(jobId)}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    createFeedback(input: CreateFeedbackInput) {
      return request<ApiFeedbackResponse>("/feedback", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    executeWriteback(input: ExecuteWritebackInput, options: ApiRequestOptions = {}) {
      return request<ApiWritebackResponse>("/writeback", {
        method: "POST",
        body: JSON.stringify(input),
        ...withOptionalSignal(options.signal)
      });
    },
    listEligibleWritebacks(limit = 20, options: ApiRequestOptions = {}) {
      const search = new URLSearchParams({
        limit: String(limit)
      });

      return request<ApiCollectionResponse<ApiWritebackEligibleItem>>(`/writeback/eligible?${search.toString()}`, {
        ...withOptionalSignal(options.signal)
      });
    },
    listAudit() {
      return request<ApiAuditListResponse>("/audit?take=20");
    }
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

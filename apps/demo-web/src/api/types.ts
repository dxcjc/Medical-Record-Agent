import type {
  AuditTargetType,
  BuiltInOrCustomString,
  DataProvenance,
  EvaluationMetricName,
  RecognitionJobStatus
} from "@medical-record-agent/shared";

export type ApiJsonPrimitive = string | number | boolean | null;
export type ApiJsonValue = ApiJsonPrimitive | ApiJsonObject | ApiJsonValue[];
export type ApiJsonObject = {
  [key: string]: ApiJsonValue;
};

export type ApiClientOptions = {
  baseUrl?: string;
  getToken?: () => string | null;
};

export type ApiRequestOptions = {
  signal?: AbortSignal;
};

export type ApiCollectionResponse<TItem> = {
  items: TItem[];
};

export type HealthResponse = {
  status: string;
  service: string;
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
  metadata?: ApiJsonObject;
};

export type ApiFileRecord = {
  id: string;
  originalName?: string;
  mimeType?: string;
  byteSize?: number;
  sizeBytes?: number;
  checksumSha256?: string;
  storageKey?: string;
  createdAt?: string;
  metadata?: ApiJsonObject;
};

export type FileContentResponse = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

export type ApiSchemaVersionStatus = "draft" | "active" | "inactive" | "archived" | "published" | "ready" | string;

export type ApiSchemaVersionResponse = {
  id: string;
  schemaKey?: string;
  key?: string;
  versionId?: string;
  displayName?: string;
  name?: string;
  label?: string;
  version?: string | number;
  versionName?: string;
  semver?: string;
  status?: ApiSchemaVersionStatus;
  state?: ApiSchemaVersionStatus;
  lifecycleStatus?: ApiSchemaVersionStatus;
  versionStatus?: ApiSchemaVersionStatus;
  domain?: string;
  schemaType?: string;
  owner?: string;
  author?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  coverage?: number;
  fieldCoverage?: number;
  errorRate?: number;
  criticalErrorRate?: number;
  changelog?: string;
  changeSummary?: string;
  description?: string;
  definition?: ApiJsonValue;
};

export type CreateSchemaDraftInput = {
  schemaKey: string;
  displayName: string;
  definition: ApiJsonValue;
};

export type UpdateSchemaDraftInput = {
  definition: ApiJsonValue;
};

export type ApiSchemaDraftResponse = {
  draft?: ApiSchemaVersionResponse;
  schema?: ApiSchemaVersionResponse;
  version?: ApiSchemaVersionResponse;
  id?: string;
};

export type ApiSchemaValidationIssue = {
  code?: string;
  rule?: string;
  id?: string;
  path?: string;
  target?: string;
  fieldKey?: string;
  message?: string;
  detail?: string;
  description?: string;
  level?: string;
};

export type ApiSchemaValidationResponse = {
  validation?: {
    valid?: boolean;
    isValid?: boolean;
    errors?: ApiSchemaValidationIssue[];
    issues?: ApiSchemaValidationIssue[];
    violations?: ApiSchemaValidationIssue[];
  };
  valid?: boolean;
  isValid?: boolean;
  errors?: ApiSchemaValidationIssue[];
  issues?: ApiSchemaValidationIssue[];
  violations?: ApiSchemaValidationIssue[];
};

export type ApiSchemaCompareResponse = {
  schemaKey?: string;
  left?: string;
  right?: string;
  rows?: ApiJsonObject[];
  changes?: ApiJsonObject[];
  summary?: ApiJsonObject;
};

export type ApiProviderKind = BuiltInOrCustomString<"ocr" | "llm" | "hybrid" | "storage" | "lims">;
export type ApiProviderHealthStatus = "healthy" | "degraded" | "unhealthy" | "unchecked" | string;

export type ApiProviderItem = {
  key: string;
  id?: string;
  name?: string;
  displayName?: string;
  label?: string;
  kind?: ApiProviderKind;
  enabled?: boolean;
  isDefault?: boolean;
  isMock?: boolean;
  status?: string;
  vendor?: string;
  model?: string;
  config?: ApiJsonObject;
  secretRefs?: ApiJsonObject;
};

export type SaveProviderConfigInput = {
  kind: ApiProviderKind;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  config: ApiJsonObject;
  secretRefs?: ApiJsonObject;
};

export type ApiProviderResponse = {
  provider: ApiProviderItem;
};

export type ApiProviderHealth = {
  key?: string;
  status: ApiProviderHealthStatus;
  latencyMs?: number;
  checkedAt?: string;
  message?: string;
};

export type ApiProviderHealthResponse = {
  health: ApiProviderHealth;
};

export type ApiEvaluationDataset = {
  id: string;
  key?: string;
  displayName?: string;
  name?: string;
  description?: string;
  scenario?: string;
  sampleCount?: number;
  caseCount?: number;
  samplesCount?: number;
  status?: string;
  groundTruthStatus?: string;
  deidentified?: boolean;
  owner?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: ApiJsonObject;
};

export type CreateEvaluationDatasetInput = {
  key: string;
  displayName: string;
  description?: string;
  deidentified: boolean;
  metadata?: ApiJsonObject;
};

export type EvaluationSampleGroundTruthField = {
  fieldKey?: string;
  value: ApiJsonValue;
  normalizedValue?: ApiJsonValue;
  expectedNeedsReview?: boolean;
};

export type EvaluationSampleGroundTruth = Record<string, EvaluationSampleGroundTruthField>;

export type ImportEvaluationSampleInput = {
  externalId?: string;
  documentId?: string;
  provenance?: DataProvenance;
  input?: ApiJsonObject;
  groundTruth: EvaluationSampleGroundTruth;
  metadata?: ApiJsonObject;
};

export type ApiEvaluationSample = Partial<ImportEvaluationSampleInput> & {
  id?: string;
  datasetId?: string;
  createdAt?: string;
};

export type ApiEvaluationSamplesResponse = {
  samples: ApiEvaluationSample[];
};

export type CreateEvaluationRunInput = {
  datasetId: string;
  schemaKey?: string;
  providerKey: string;
  sampleLimit?: number;
};

export type ApiEvaluationRun = {
  id: string;
  runId?: string;
  name?: string;
  displayName?: string;
  datasetId?: string;
  schemaKey?: string;
  schemaVersion?: string;
  providerKey?: string;
  modelVersion?: string;
  providerConfigId?: string;
  status?: "queued" | "running" | "completed" | "succeeded" | "failed" | string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: ApiJsonObject;
};

export type ApiEvaluationRunResponse = {
  run: ApiEvaluationRun;
};

export type ApiEvaluationMetric = {
  name: EvaluationMetricName;
  label?: string;
  value: number;
  score?: number;
  unit?: string;
  fieldKey?: string;
};

export type ApiEvaluationMetricsResponse = {
  metrics: ApiEvaluationMetric[];
};

export type ApiRecognitionProviderConfig = {
  ocrProviderKey?: string;
  providerKey?: string;
};

export type CreateRecognitionJobInput = {
  schemaKey: string;
  schemaVersionId?: string;
  sourceFileId?: string;
  document?: ApiJsonObject;
  options?: ApiJsonObject;
  providerConfig?: ApiRecognitionProviderConfig;
};

export type ApiRecognitionJob = {
  id: string;
  jobId?: string;
  status?: RecognitionJobStatus | "confirmed" | "writeback_failed" | string;
  executionMode?: "synchronous" | "queued" | "async" | string;
  statusUrl?: string;
  resultUrl?: string;
  statusSemantics?: ApiJsonObject;
  schemaKey?: string;
  schemaVersionId?: string;
  sourceFileId?: string;
  fileId?: string;
  documentId?: string;
  subject?: string;
  title?: string;
  confirmed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  providerConfig?: ApiRecognitionProviderConfig;
  payload?: ApiJsonObject;
};

export type ApiRecognitionFieldCandidate = {
  fieldKey?: string;
  field?: string;
  name?: string;
  label?: string;
  value?: ApiJsonValue;
  candidateValue?: ApiJsonValue;
  text?: string;
  rawValue?: string;
  confidence?: number;
  score?: number;
  source?: string;
  evidenceSource?: string;
  location?: string;
  decision?: string;
  evidence?: ApiJsonObject[];
};

export type ApiRecognitionResult = {
  id?: string;
  jobId?: string;
  payload?: ApiJsonObject;
  fields?: ApiRecognitionFieldCandidate[];
  normalizedFields?: ApiJsonValue;
  fieldCandidates?: ApiRecognitionFieldCandidate[];
  candidates?: ApiRecognitionFieldCandidate[];
  evidence?: ApiJsonObject[];
  evidenceItems?: ApiJsonObject[];
  trace?: ApiJsonObject[];
  traceSteps?: ApiJsonObject[];
  steps?: ApiJsonObject[];
  ocrText?: string;
  text?: string;
  rawText?: string;
  extraction?: ApiJsonObject;
  reviewRequired?: boolean;
  readyFields?: ApiWritebackReadyField[];
};

export type CreateFeedbackInput = {
  jobId?: string;
  sampleId?: string;
  source?: string;
  field?: string;
  originalValue?: ApiJsonValue;
  expected?: ApiJsonValue;
  actual?: ApiJsonValue;
  correctedValue?: ApiJsonValue;
  decision?: string;
  label?: string;
  status?: string;
  reason?: string;
  reviewer?: string;
  confidence?: number;
  evidenceId?: string;
  evidenceQuote?: string;
  payload?: ApiJsonObject;
};

export type ApiFeedbackResponse = {
  id?: string;
  feedbackId?: string;
  feedback?: {
    id?: string;
    feedbackId?: string;
  };
};

export type ApiWritebackReadyField = {
  fieldKey: string;
  targetPath: string;
  value: string | number | boolean | string[] | null;
};

export type ExecuteWritebackInput = {
  jobId: string;
  confirmed: true;
  idempotencyKey?: string;
};

export type ApiWritebackResponse = {
  status?: "pending" | "success" | "succeeded" | "failed" | "partial" | string;
  requestId?: string;
  resultId?: string;
  externalReceiptId?: string;
  message?: string;
};

export type ApiWritebackEligibleItem = {
  id?: string;
  jobId?: string;
  schemaKey?: string;
  sourceFileId?: string;
  extractedFields?: number;
  blockers?: string[];
  fields?: ApiWritebackReadyField[];
  readyFields?: ApiWritebackReadyField[];
  payload?: ApiJsonObject;
};

export type ApiAuditEntry = {
  [key: string]: ApiJsonValue | undefined;
  id?: string;
  auditId?: string;
  time?: string;
  createdAt?: string;
  timestamp?: string;
  actor?: string;
  actorUserId?: string;
  userId?: string;
  action?: string;
  event?: string;
  target?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  objectType?: string;
  objectId?: string;
  resourceType?: string;
  resourceId?: string;
  risk?: "low" | "medium" | "high" | string;
  level?: string;
  result?: string;
  status?: string;
  ip?: string;
  ipAddress?: string;
  metadata?: ApiJsonObject;
};

export type ApiAuditListResponse = ApiCollectionResponse<ApiAuditEntry>;

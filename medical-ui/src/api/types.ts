// TypeScript types matching backend models

export interface User {
  id: string;
  email: string;
  displayName: string;
  status?: 'active' | 'disabled';
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export type RecognitionJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial_completed'
  | 'needs_review'
  | 'writeback_pending'
  | 'writeback_completed'
  | 'writeback_failed'
  | 'failed';

export interface TraceStep {
  step?: string;
  node?: string;
  status: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

/** 识别任务选项 */
export interface RecognitionJobOptions {
  skipOcr?: boolean;
  skipNormalization?: boolean;
  dryRun?: boolean;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface RecognitionJob {
  id: string;
  status: RecognitionJobStatus;
  schemaKey: string;
  schemaVersionId?: string;
  sourceFileId?: string;
  createdById?: string;
  createdByName?: string;
  providerConfig: ProviderConfigMap;
  options: RecognitionJobOptions;
  trace: TraceStep[];
  warnings: unknown[];
  error?: unknown;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  sourceFile?: StoredFile;
  result?: RecognitionResult;
}

/** 字段抽取值（支持多种类型） */
export type ExtractedFieldValue = string | number | boolean | string[] | null;

/** 字段抽取结果映射 */
export type FieldExtractionMap = Record<string, ExtractedFieldValue>;

export interface RecognitionResult {
  id: string;
  jobId: string;
  fields: FieldExtractionMap;
  normalizedFields: FieldExtractionMap;
  evidence: EvidenceItem[];
  payload: RecognitionResultPayload;
  confidence?: string;
  reviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 识别结果 payload 结构 */
export interface RecognitionResultPayload {
  providerName?: string;
  ocrPages?: number;
  extractedFieldCount?: number;
  schemaKey?: string;
  ocr?: {
    provider?: string;
    pages?: Array<{ page: number; text: string }>;
    blocks?: Array<{ text: string; confidence: number; page: number; blockId?: string; coordinates?: OcrCoordinates }>;
    [key: string]: unknown;
  };
  extraction?: {
    provider?: string;
    model?: string;
    tokenUsage?: { total?: number; prompt?: number; completion?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  validation?: {
    fieldResults?: Array<{ fieldKey?: string; decision?: string; issues?: string[]; confidence?: number }>;
    [key: string]: unknown;
  };
  rag?: {
    query?: string;
    hits?: Array<{ title?: string; score?: number; content?: string }>;
    misses?: string[];
    [key: string]: unknown;
  };
  text?: string;
  ocrText?: string;
  ocr_text?: string;
  rawText?: string;
  [key: string]: unknown;
}

/** OCR 坐标 */
export interface OcrCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvidenceItem {
  fieldKey?: string;
  snippet?: string;
  page?: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: string;
  createdAt: string;
}

export interface SchemaVersion {
  id: string;
  schemaKey: string;
  version: number;
  displayName: string;
  status: 'active' | 'inactive' | 'deprecated';
  definition: SchemaDefinition;
  changelog: string;
  publishedAt: string;
  createdAt: string;
}

export interface SchemaDefinition {
  fields?: SchemaField[];
  [key: string]: unknown;
}

export interface SchemaField {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  critical?: boolean;
  description?: string;
  comments?: string;
  enumMap?: Record<string, string>;
  adapterHints?: { limsTargetPath?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Draft 验证报告 */
export interface ValidationReport {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
  [key: string]: unknown;
}

export interface SchemaDraft {
  id: string;
  schemaKey: string;
  displayName: string;
  status: 'draft' | 'validating' | 'invalid' | 'ready' | 'published' | 'archived';
  definition: SchemaDefinition;
  validationReport: ValidationReport;
  createdAt: string;
  updatedAt: string;
}

export type ProviderKind = 'ocr' | 'llm' | 'storage' | 'lims';

/** Provider 配置参数映射 */
export interface ProviderConfigMap {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  providerKey?: string;
  ocrProviderKey?: string;
  [key: string]: unknown;
}

/** Provider 密钥引用映射 */
export interface ProviderSecretRefs {
  apiKeyRef?: string;
  endpointRef?: string;
  [key: string]: string | undefined;
}

export interface ProviderConfig {
  id: string;
  key: string;
  kind: ProviderKind;
  displayName: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  config: ProviderConfigMap;
  secretRefs: ProviderSecretRefs;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderHealth {
  healthy: boolean;
  latency?: number;
  message?: string;
  checkedAt?: string;
  [key: string]: unknown;
}

export interface EvaluationDataset {
  id: string;
  key: string;
  displayName: string;
  description?: string;
  status: 'draft' | 'ready' | 'archived';
  deidentified: boolean;
  metadata: EvaluationDatasetMetadata;
  createdAt: string;
  updatedAt: string;
  _count?: { samples: number };
}

/** 评测数据集元数据 */
export interface EvaluationDatasetMetadata {
  source?: string;
  language?: string;
  tags?: string[];
  schemaKey?: string;
  [key: string]: unknown;
}

export interface EvaluationSample {
  id: string;
  datasetId: string;
  fileId?: string;
  recognitionJobId?: string;
  externalId?: string;
  groundTruth: FieldExtractionMap;
  metadata: EvaluationSampleMetadata;
  createdAt: string;
}

/** 评测样本元数据 */
export interface EvaluationSampleMetadata {
  source?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  [key: string]: unknown;
}

export interface EvaluationRun {
  id: string;
  datasetId: string;
  schemaKey?: string;
  schemaVersionId?: string;
  providerKey: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  sampleLimit?: number;
  createdAt: string;
  completedAt?: string;
  dataset?: EvaluationDataset;
}

export interface EvaluationMetric {
  id: string;
  runId: string;
  metricName: string;
  value: number;
  metadata: EvaluationMetricMetadata;
  createdAt: string;
}

/** 评测指标元数据 */
export interface EvaluationMetricMetadata {
  fieldKey?: string;
  sampleCount?: number;
  correctCount?: number;
  breakdown?: Record<string, {
    precision?: number;
    recall?: number;
    f1?: number;
    accuracy?: number;
  }>;
  [key: string]: unknown;
}

export interface AuditEntry {
  id: string;
  actorUserId?: string;
  action: string;
  objectType: string;
  objectId?: string;
  result: 'success' | 'failure';
  ipAddress?: string;
  metadata: AuditEntryMetadata;
  createdAt: string;
  actorUser?: { id: string; email: string; displayName: string };
}

/** 审计条目元数据 */
export interface AuditEntryMetadata {
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface DashboardStats {
  todayJobs: number;
  needsReview: number;
  completedJobs: number;
  onlineProviders: number;
  totalJobs: number;
  recentAlerts: Array<{
    id: string;
    status: string;
    schemaKey: string;
    createdAt: string;
    [key: string]: unknown;
  }>;
}

export interface AuditActionLabel {
  [key: string]: string;
}

export interface FieldValue {
  key: string;
  value: unknown;
  confidence?: number;
  evidence?: string;
  [key: string]: unknown;
}

export interface FieldStatItem {
  fieldKey: string;
  recognitionCount: number;
  avgConfidence: number | null;
  reviewCount: number;
  correctionCount: number;
  commonErrors: Array<{ original: string; corrected: string; count: number }>;
}

export interface KnowledgeEntry {
  id: string;
  kind: 'medical_term' | 'cancer_alias' | 'lims_dictionary' | 'field_description';
  title: string;
  content: string;
  keywords: string[];
  fieldKeys: string[];
  enabled: boolean;
  sortOrder: number;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FeedbackSubmission {
  id: string;
  jobId: string;
  schemaVersionId?: string;
  submittedById?: string;
  fieldKey?: string;
  originalValue?: unknown;
  correctedValue?: unknown;
  comment?: string;
  status: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

/** 反馈提交请求体 */
export interface FeedbackSubmitRequest {
  jobId: string;
  schemaVersionId?: string;
  fieldKey: string;
  originalValue?: unknown;
  correctedValue: unknown;
  comment?: string;
}

export interface WritebackAttempt {
  id: string;
  jobId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  targetSystem: string;
  endpoint: string;
  idempotencyKey: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: unknown;
  attemptedAt: string;
  completedAt?: string;
}

/** 可回写条目 */
export interface WritebackEligibleItem {
  id?: string;
  jobId: string;
  schemaKey: string;
  status: RecognitionJobStatus;
  createdAt: string;
  result?: RecognitionResult;
  readyFields?: Array<{ fieldKey: string; value: unknown }>;
}

/** 回写执行结果 */
export interface WritebackExecuteResult {
  attemptId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  message?: string;
}

export interface FeedbackFieldStat {
  fieldKey: string;
  count: number;
}

export interface TrendDataPoint {
  date: string;
  total: number;
  extracted: number;
  failed: number;
}

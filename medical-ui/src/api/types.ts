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
  step: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

export interface RecognitionJob {
  id: string;
  status: RecognitionJobStatus;
  schemaKey: string;
  schemaVersionId?: string;
  sourceFileId?: string;
  createdById?: string;
  providerConfig: Record<string, unknown>;
  options: Record<string, unknown>;
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

export interface RecognitionResult {
  id: string;
  jobId: string;
  fields: Record<string, unknown>;
  normalizedFields: Record<string, unknown>;
  evidence: EvidenceItem[];
  payload: Record<string, unknown>;
  confidence?: string;
  reviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
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
  description?: string;
  [key: string]: unknown;
}

export interface SchemaDraft {
  id: string;
  schemaKey: string;
  displayName: string;
  status: 'draft' | 'validating' | 'invalid' | 'ready' | 'published' | 'archived';
  definition: SchemaDefinition;
  validationReport: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ProviderKind = 'ocr' | 'llm' | 'storage' | 'lims';

export interface ProviderConfig {
  id: string;
  key: string;
  kind: ProviderKind;
  displayName: string;
  status: 'active' | 'disabled';
  isDefault: boolean;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: { samples: number };
}

export interface EvaluationSample {
  id: string;
  datasetId: string;
  fileId?: string;
  recognitionJobId?: string;
  externalId?: string;
  groundTruth: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
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
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorUserId?: string;
  action: string;
  objectType: string;
  objectId?: string;
  result: 'success' | 'failure';
  ipAddress?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorUser?: { id: string; email: string; displayName: string };
}

export interface PaginatedResponse<T> {
  items: T[];
}

export interface FieldValue {
  key: string;
  value: unknown;
  confidence?: number;
  evidence?: string;
  [key: string]: unknown;
}

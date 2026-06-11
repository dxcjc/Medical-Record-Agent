import type {
  ApiCollectionResponse,
  ApiEvaluationDataset,
  ApiEvaluationMetricsResponse,
  ApiEvaluationRun,
  ApiEvaluationRunResponse,
  ApiProviderItem,
  ApiRecognitionJob,
  ApiRecognitionResult,
  ApiSchemaValidationResponse,
  ApiSchemaVersionResponse,
  ApiWritebackEligibleItem,
  ApiWritebackReadyField
} from "./types";
import type { EvaluationDataset, EvaluationRun } from "../pages/evaluation/components/evaluationData";
import type { EvidenceItem, FieldCandidate, TraceStep } from "../pages/recognition/components/demoData";
import type { SchemaRecord, SchemaStatus, SchemaVersion } from "../pages/schema/components/schemaStudioData";

export type SelectOption = {
  value: string;
  label: string;
};

export type RecognitionDetailState = {
  jobId?: string;
  sourceFileId?: string;
  status?: string;
  ocrText?: string;
  fields?: FieldCandidate[];
  evidence?: EvidenceItem[];
  trace?: TraceStep[];
  payload?: unknown;
};

export type WritebackJobView = {
  id: string;
  subject: string;
  target: "LIMS" | "EMR" | "Archive";
  extractedFields: number;
  greenRules: string[];
  blockers: string[];
  status: "ready" | "blocked" | "running" | "done";
  permission: "allowed" | "readonly";
  payload: Record<string, unknown>;
};

export type MetricCardView = {
  id: string;
  label: string;
  value: string;
  delta: string;
  detail: string;
};

export type TraceStatusView = "success" | "warning" | "failed";

export type TraceSpanView = {
  id: string;
  name: string;
  service: string;
  durationMs: number;
  status: TraceStatusView;
  detail: string;
};

export type TraceRunView = {
  id: string;
  subject: string;
  startedAt: string;
  totalMs: number;
  status: TraceStatusView;
  spans: TraceSpanView[];
  payload: Record<string, unknown>;
};

export type SchemaCatalogView = {
  records: SchemaRecord[];
  versionsById: Record<string, SchemaVersion[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readNumber(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function readBoolean(record: Record<string, unknown> | undefined, keys: string[]): boolean | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function normalizeSchemaStatus(value: string | undefined): SchemaStatus {
  if (value === "draft" || value === "active" || value === "inactive" || value === "archived") {
    return value;
  }

  if (value === "published" || value === "ready") {
    return "active";
  }

  return "archived";
}

function formatSchemaVersion(value: string | number | undefined): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? `v${value}` : "未知版本";
  }

  return value && value.length > 0 ? value : "未知版本";
}

function normalizeSchemaCatalogItem(
  item: ApiSchemaVersionResponse,
  index: number,
  fallbackRecords: SchemaRecord[],
  fallbackVersionsById: Record<string, SchemaVersion[]>
) {
  const source = item as Record<string, unknown>;
  const schemaKey = item.schemaKey ?? item.key ?? item.id;
  const versionId = item.id ?? item.versionId;
  if (!schemaKey || !versionId) {
    return null;
  }

  const fallbackSchema = fallbackRecords.find((schema) => schema.id === schemaKey) ?? fallbackRecords[index % fallbackRecords.length];
  const fallbackVersion = fallbackSchema ? fallbackVersionsById[fallbackSchema.id]?.[0] : undefined;
  const displayName = item.displayName ?? item.name ?? schemaKey;
  const status = normalizeSchemaStatus(item.status ?? item.state ?? item.lifecycleStatus);
  const rawVersion = item.version ?? item.versionName ?? item.semver;
  const versionText = formatSchemaVersion(rawVersion);

  const record: SchemaRecord = {
    id: schemaKey,
    name: displayName,
    domain: item.domain ?? item.schemaType ?? fallbackSchema?.domain ?? "真实 API",
    owner: item.owner ?? item.createdBy ?? fallbackSchema?.owner ?? "后端返回",
    activeVersion: status === "active" ? versionText : fallbackSchema?.activeVersion ?? versionText,
    draftVersion: fallbackSchema?.draftVersion ?? "后端未返回草稿",
    affectedPipelines: fallbackSchema?.affectedPipelines ?? ["真实 Schema API"],
    deactivationRisk: fallbackSchema?.deactivationRisk ?? "中"
  };

  const version: SchemaVersion = {
    id: versionId,
    version: versionText,
    status,
    author: item.author ?? item.createdBy ?? item.updatedBy ?? fallbackVersion?.author ?? "后端返回",
    updatedAt: item.updatedAt ?? item.createdAt ?? fallbackVersion?.updatedAt ?? "后端未返回",
    coverage: item.coverage ?? item.fieldCoverage ?? fallbackVersion?.coverage ?? 0,
    errorRate: item.errorRate ?? item.criticalErrorRate ?? fallbackVersion?.errorRate ?? 0,
    changeSummary: item.changelog ?? item.changeSummary ?? item.description ?? fallbackVersion?.changeSummary ?? "后端版本记录"
  };

  return { record, version, status: readString(source, ["status", "state", "lifecycleStatus", "versionStatus"]) ?? "未知" };
}

export function normalizeSchemaCatalog(
  items: ApiSchemaVersionResponse[],
  fallbackRecords: SchemaRecord[],
  fallbackVersionsById: Record<string, SchemaVersion[]>
): SchemaCatalogView {
  const records = new Map<string, SchemaRecord>();
  const versionsById: Record<string, SchemaVersion[]> = {};

  items.forEach((item, index) => {
    const mapped = normalizeSchemaCatalogItem(item, index, fallbackRecords, fallbackVersionsById);
    if (!mapped) {
      return;
    }

    const current = records.get(mapped.record.id);
    records.set(mapped.record.id, current ? { ...current, ...mapped.record } : mapped.record);
    versionsById[mapped.record.id] = [...(versionsById[mapped.record.id] ?? []), mapped.version];
  });

  return {
    records: Array.from(records.values()),
    versionsById
  };
}

export function summarizeSchemaVersionStatuses(items: ApiSchemaVersionResponse[]) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const source = item as Record<string, unknown>;
    const status = readString(source, ["status", "state", "lifecycleStatus", "versionStatus"]) ?? "未知";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  if (counts.size === 0) {
    return "暂无状态";
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${status} ${count}`)
    .join("、");
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readNestedArray(record: Record<string, unknown>, path: string[]): unknown[] | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return readArray(current);
}

function findFirstArray(record: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = readArray(record[key]);
    if (value && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function readItems<TItem>(response: ApiCollectionResponse<TItem>): TItem[] {
  return Array.isArray(response.items) ? response.items : [];
}

export function normalizeSchemaSelectOptions(response: ApiCollectionResponse<Partial<ApiSchemaVersionResponse>>): SelectOption[] {
  return readItems(response).flatMap((item): SelectOption[] => {
    const value = item.schemaKey ?? item.key ?? item.id;
    if (!value) {
      return [];
    }

    const displayName = item.displayName ?? item.label ?? item.name ?? value;
    const version = typeof item.version === "number" || typeof item.version === "string" ? ` v${item.version}` : "";

    return [
      {
        value,
        label: `${displayName}${version}`
      }
    ];
  });
}

function readProviderConfigMode(config: ApiProviderItem["config"] | undefined) {
  return isRecord(config) ? readString(config, ["providerKind", "provider", "kind", "mode"])?.toLowerCase() : undefined;
}

export function isMockProviderItem(item: Partial<ApiProviderItem>) {
  const key = item.key ?? item.id ?? "";
  const status = typeof item.status === "string" ? item.status.toLowerCase() : "";
  const providerMode = readProviderConfigMode(item.config);
  const statusParts = status.split("_");
  const isHiddenInternalStatus = statusParts.length === 2 && statusParts[0] === "development" && statusParts[1] === "placeholder";

  return (
    item.isMock === true ||
    isHiddenInternalStatus ||
    providerMode === "mock" ||
    key.toLowerCase().startsWith("mock-")
  );
}

export function normalizeProviderSelectOptions(
  response: ApiCollectionResponse<ApiProviderItem>,
  kind: "ocr" | "llm"
): SelectOption[] {
  return readItems(response).flatMap((item): SelectOption[] => {
    if (item.kind !== kind || item.enabled === false || isMockProviderItem(item)) {
      return [];
    }

    const value = item.key ?? item.id;
    if (!value) {
      return [];
    }

    return [
      {
        value,
        label: item.displayName ?? item.name ?? item.label ?? value
      }
    ];
  });
}

export function normalizeProviderItems(response: ApiCollectionResponse<ApiProviderItem>): ApiProviderItem[] {
  return readItems(response).map((item) => {
    const provider: ApiProviderItem = {
      key: item.key,
      name: item.name ?? item.displayName ?? item.label ?? "未命名 provider",
      enabled: item.enabled === true,
      isDefault: item.isDefault === true,
      isMock: item.isMock === true
    };

    if (item.id) {
      provider.id = item.id;
    }
    if (item.displayName) {
      provider.displayName = item.displayName;
    }
    if (item.label) {
      provider.label = item.label;
    }
    if (item.kind) {
      provider.kind = item.kind;
    }
    if (item.status) {
      provider.status = item.status;
    }
    if (item.vendor) {
      provider.vendor = item.vendor;
    }
    if (item.model) {
      provider.model = item.model;
    }
    if (item.config) {
      provider.config = item.config;
    }
    if (item.secretRefs) {
      provider.secretRefs = item.secretRefs;
    }

    return provider;
  });
}

function readDisplayValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "boolean") {
      return value ? "是" : "否";
    }

    if (Array.isArray(value) && value.length > 0) {
      const joined = value
        .map((item) => {
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            return String(item);
          }

          return undefined;
        })
        .filter((item): item is string => Boolean(item))
        .join("、");

      if (joined.length > 0) {
        return joined;
      }
    }
  }

  return undefined;
}

function normalizeDecision(value: unknown, confidence: number): FieldCandidate["decision"] {
  if (value === "green" || value === "accepted") {
    return "green";
  }

  if (value === "red" || value === "rejected" || value === "blocked") {
    return "red";
  }

  if (value === "yellow" || value === "needs_review") {
    return "yellow";
  }

  if (confidence >= 0.9) {
    return "green";
  }

  return confidence >= 0.75 ? "yellow" : "red";
}

function normalizeTraceStepStatus(value: unknown): TraceStep["status"] {
  return value === "done" || value === "active" || value === "blocked" ? value : "done";
}

function findCandidateItems(result: Record<string, unknown>): unknown[] | undefined {
  const payload = isRecord(result.payload) ? result.payload : undefined;
  const extraction = isRecord(result.extraction) ? result.extraction : undefined;
  const payloadExtraction = payload && isRecord(payload.extraction) ? payload.extraction : undefined;

  return (
    findFirstArray(result, ["fields", "fieldCandidates", "candidates"]) ??
    (extraction ? findFirstArray(extraction, ["fields", "fieldCandidates", "candidates"]) : undefined) ??
    (payload ? findFirstArray(payload, ["fields", "fieldCandidates", "candidates"]) : undefined) ??
    (payloadExtraction ? findFirstArray(payloadExtraction, ["fields", "fieldCandidates", "candidates"]) : undefined)
  );
}

function readCandidateEvidence(item: Record<string, unknown>): Record<string, unknown>[] {
  return (readArray(item.evidence) ?? []).filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function formatEvidenceSource(evidence: Record<string, unknown> | undefined): string | undefined {
  if (!evidence) {
    return undefined;
  }

  const page = readNumber(evidence, ["page", "pageNumber"]);
  const blockId = readString(evidence, ["ocrBlockId", "blockId", "id"]);

  if (page !== undefined && blockId) {
    return `第 ${page} 页 ${blockId}`;
  }

  if (page !== undefined) {
    return `第 ${page} 页`;
  }

  return blockId;
}

function normalizeRecognitionFields(result: ApiRecognitionResult): FieldCandidate[] | undefined {
  const resultRecord = result as Record<string, unknown>;
  const sourceItems = findCandidateItems(resultRecord);
  const parsed = sourceItems
    ?.map((item): FieldCandidate | null => {
      if (!isRecord(item)) {
        return null;
      }

      const field = readString(item, ["field", "name", "label", "fieldKey"]);
      const value = readDisplayValue(item, ["value", "candidateValue", "text", "rawValue"]);

      if (!field || !value) {
        return null;
      }

      const confidence = readNumber(item, ["confidence", "score"]) ?? 0;
      const firstEvidence = readCandidateEvidence(item)[0];

      return {
        field,
        value,
        confidence,
        source: readString(item, ["source", "evidenceSource", "location"]) ?? formatEvidenceSource(firstEvidence) ?? "真实接口返回",
        decision: normalizeDecision(item.decision, confidence)
      };
    })
    .filter((item): item is FieldCandidate => Boolean(item));

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function normalizeNestedEvidenceItems(result: Record<string, unknown>): EvidenceItem[] | undefined {
  const candidates = findCandidateItems(result);
  const parsed = candidates
    ?.flatMap((candidate, candidateIndex): EvidenceItem[] => {
      if (!isRecord(candidate)) {
        return [];
      }

      const field = readString(candidate, ["field", "fieldName", "label", "fieldKey"]);
      if (!field) {
        return [];
      }

      const candidateConfidence = readNumber(candidate, ["confidence", "score"]) ?? 0;
      return readCandidateEvidence(candidate)
        .map((item, evidenceIndex): EvidenceItem | null => {
          const quote = readString(item, ["quote", "text", "snippet"]);
          if (!quote) {
            return null;
          }

          return {
            id: readString(item, ["id", "evidenceId", "ocrBlockId", "blockId"]) ?? `API-E-${candidateIndex + 1}-${evidenceIndex + 1}`,
            field,
            quote,
            page: readNumber(item, ["page", "pageNumber"]) ?? 1,
            confidence: readNumber(item, ["confidence", "score"]) ?? candidateConfidence
          };
        })
        .filter((item): item is EvidenceItem => Boolean(item));
    });

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function normalizeEvidenceItems(result: ApiRecognitionResult): EvidenceItem[] | undefined {
  const resultRecord = result as Record<string, unknown>;
  const payload = isRecord(result.payload) ? result.payload : undefined;
  const sourceItems = findFirstArray(resultRecord, ["evidence", "evidenceItems"]) ?? (payload ? findFirstArray(payload, ["evidence", "evidenceItems"]) : undefined);
  const parsed = sourceItems
    ?.map((item, index): EvidenceItem | null => {
      if (!isRecord(item)) {
        return null;
      }

      const field = readString(item, ["field", "fieldName", "label", "fieldKey"]);
      const quote = readString(item, ["quote", "text", "snippet"]);

      if (!field || !quote) {
        return null;
      }

      return {
        id: readString(item, ["id", "evidenceId"]) ?? `API-E-${index + 1}`,
        field,
        quote,
        page: readNumber(item, ["page", "pageNumber"]) ?? 1,
        confidence: readNumber(item, ["confidence", "score"]) ?? 0
      };
    })
    .filter((item): item is EvidenceItem => Boolean(item));

  if (parsed && parsed.length > 0) {
    return parsed;
  }

  return normalizeNestedEvidenceItems(resultRecord);
}

function normalizeRecognitionTraceSteps(result: ApiRecognitionResult): TraceStep[] | undefined {
  const resultRecord = result as Record<string, unknown>;
  const payload = isRecord(result.payload) ? result.payload : undefined;
  const sourceItems = findFirstArray(resultRecord, ["trace", "traceSteps", "steps"]) ?? (payload ? findFirstArray(payload, ["trace", "traceSteps", "steps"]) : undefined);
  const parsed = sourceItems
    ?.map((item, index): TraceStep | null => {
      if (!isRecord(item)) {
        return null;
      }

      const node = readString(item, ["node", "name", "step"]);
      if (!node) {
        return null;
      }

      return {
        id: readString(item, ["id", "traceId"]) ?? `API-T-${index + 1}`,
        node,
        status: normalizeTraceStepStatus(item.status),
        durationMs: readNumber(item, ["durationMs", "duration", "elapsedMs"]) ?? 0,
        detail: readString(item, ["detail", "message", "description"]) ?? "真实接口返回的流程节点。"
      };
    })
    .filter((item): item is TraceStep => Boolean(item));

  return parsed && parsed.length > 0 ? parsed : undefined;
}

function normalizeOcrText(result: ApiRecognitionResult): string | undefined {
  const resultRecord = result as Record<string, unknown>;
  const directText = readString(resultRecord, ["ocrText", "text", "rawText"]);
  if (directText) {
    return directText;
  }

  return isRecord(result.payload) ? readString(result.payload, ["ocrText", "text", "rawText"]) : undefined;
}

export function normalizeRecognitionDetail(job: ApiRecognitionJob, result: ApiRecognitionResult): RecognitionDetailState {
  const jobRecord = job as Record<string, unknown>;
  const resultRecord = result as Record<string, unknown>;
  const detail: RecognitionDetailState = {};
  const jobId = readString(jobRecord, ["id", "jobId"]);
  const sourceFileId = readString(jobRecord, ["sourceFileId", "fileId"]);
  const status = readString(jobRecord, ["status"]);
  const ocrText = normalizeOcrText(result);
  const fields = normalizeRecognitionFields(result);
  const evidence = normalizeEvidenceItems(result);
  const trace = normalizeRecognitionTraceSteps(result);
  const payload = "payload" in resultRecord ? resultRecord.payload : undefined;

  if (jobId) {
    detail.jobId = jobId;
  }

  if (sourceFileId) {
    detail.sourceFileId = sourceFileId;
  }

  if (status) {
    detail.status = status;
  }

  if (ocrText) {
    detail.ocrText = ocrText;
  }

  if (fields) {
    detail.fields = fields;
  }

  if (evidence) {
    detail.evidence = evidence;
  }

  if (trace) {
    detail.trace = trace;
  }

  if (payload !== undefined) {
    detail.payload = payload;
  }

  return detail;
}

function isWritebackFieldValue(value: unknown): value is ApiWritebackReadyField["value"] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function readReadyFieldsFromValue(value: unknown): ApiWritebackReadyField[] {
  return (readArray(value) ?? []).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const fieldKey = readString(item, ["fieldKey"]);
    const targetPath = readString(item, ["targetPath"]);

    if (!fieldKey || !targetPath || !isWritebackFieldValue(item.value)) {
      return [];
    }

    return [
      {
        fieldKey,
        targetPath,
        value: item.value
      }
    ];
  });
}

function readReadyFields(result: ApiRecognitionResult | ApiWritebackEligibleItem): ApiWritebackReadyField[] {
  const record = result as Record<string, unknown>;
  const payload = isRecord(record.payload) ? record.payload : undefined;
  const writeback = isRecord(record.writeback) ? record.writeback : undefined;
  const candidates = [
    readReadyFieldsFromValue(payload ? readNestedArray(payload, ["writeback", "readyFields"]) : undefined),
    readReadyFieldsFromValue(record.fields),
    readReadyFieldsFromValue(writeback ? writeback.readyFields : undefined),
    readReadyFieldsFromValue(record.readyFields)
  ];

  return candidates.find((items) => items.length > 0) ?? [];
}

function getPayloadObject(result: ApiRecognitionResult) {
  return isRecord(result.payload) ? result.payload : (result as Record<string, unknown>);
}

function getFieldCount(result: ApiRecognitionResult) {
  const record = result as Record<string, unknown>;
  const payload = isRecord(result.payload) ? result.payload : undefined;
  const fields = readArray(result.fields) ?? (payload ? readNestedArray(payload, ["fields"]) : undefined);
  const normalizedFields =
    readArray(record.normalizedFields) ??
    (payload ? readNestedArray(payload, ["normalizedFields"]) : undefined) ??
    (payload ? readNestedArray(payload, ["validation", "normalizedCandidates"]) : undefined);

  return fields?.length ?? normalizedFields?.length ?? 0;
}

export function normalizeRecognitionWritebackJob(
  jobId: string,
  job: ApiRecognitionJob,
  result: ApiRecognitionResult
): WritebackJobView {
  const jobRecord = job as Record<string, unknown>;
  const status = readString(jobRecord, ["status"]) ?? "completed";
  const reviewRequired = result.reviewRequired === true;
  const blockers = reviewRequired ? ["识别结果仍标记为需人工复核"] : [];
  const readyFields = readReadyFields(result);

  if (status !== "completed" && status !== "confirmed") {
    blockers.push(`任务状态为 ${status}，服务端写回要求 completed 或 confirmed`);
  }

  return {
    id: readString(jobRecord, ["id", "jobId"]) ?? jobId,
    subject: readString(jobRecord, ["subject", "title", "sourceFileId", "schemaKey"]) ?? `真实任务 ${jobId}`,
    target: "LIMS",
    extractedFields: getFieldCount(result),
    greenRules: ["已通过 jobId 加载真实任务", "写回执行数据只取服务端已验证 readyFields"],
    blockers,
    status: blockers.length > 0 ? "blocked" : "ready",
    permission: "allowed",
    payload: {
      jobId,
      source: "api.getJob/getResult",
      fields: readyFields,
      result: getPayloadObject(result)
    }
  };
}

export function normalizeEligibleWritebackJob(item: ApiWritebackEligibleItem): WritebackJobView {
  const record = item as Record<string, unknown>;
  const id = readString(record, ["id", "jobId"]) ?? "eligible-job";
  const schemaKey = item.schemaKey ?? "unknown-schema";
  const sourceFileId = item.sourceFileId ?? "unknown-file";
  const blockers = (readArray(item.blockers) ?? []).filter((blocker): blocker is string => typeof blocker === "string");
  const readyFields = readReadyFields(item);
  const payload = isRecord(item.payload)
    ? item.payload
    : {
        jobId: id,
        source: "writeback.eligible",
        fields: readyFields
      };

  return {
    id,
    subject: `${sourceFileId} / ${schemaKey}`,
    target: "LIMS",
    extractedFields: typeof item.extractedFields === "number" ? item.extractedFields : readyFields.length,
    greenRules: ["来自后端 eligible writeback 列表", "服务端已过滤需复核或无 readyFields 的任务"],
    blockers,
    status: blockers.length > 0 ? "blocked" : "ready",
    permission: "allowed",
    payload
  };
}

function normalizeRunStatus(status: string | undefined): EvaluationRun["status"] {
  if (status === "running") {
    return "运行中";
  }

  if (status === "completed" || status === "succeeded") {
    return "已完成";
  }

  if (status === "failed" || status === "cancelled") {
    return "已失败";
  }

  return "排队中";
}

export function normalizeEvaluationRuns(items: ApiEvaluationRun[], datasetNamesById: Map<string, string>): EvaluationRun[] {
  return items.flatMap((item): EvaluationRun[] => {
    const id = item.id ?? item.runId;
    if (!id) {
      return [];
    }

    const datasetId = item.datasetId;
    const providerKey = item.providerKey ?? item.modelVersion ?? "真实 provider";
    const schemaVersion = item.schemaVersion ?? item.schemaKey ?? "后端未返回";

    return [
      {
        id,
        name: item.name ?? item.displayName ?? `评测任务 ${id}`,
        datasetName: datasetId ? datasetNamesById.get(datasetId) ?? datasetId : "后端未返回",
        schemaVersion,
        modelVersion: providerKey,
        status: normalizeRunStatus(item.status),
        createdAt: item.createdAt ?? item.updatedAt ?? "后端未返回"
      }
    ];
  });
}

function normalizeDatasetStatus(value: string | undefined): EvaluationDataset["status"] {
  if (value === "ready" || value === "published" || value === "active") {
    return "ready";
  }

  if (value === "importing" || value === "draft") {
    return "importing";
  }

  return "blocked";
}

function normalizeGroundTruthStatus(value: string | undefined): EvaluationDataset["groundTruthStatus"] {
  if (value === "verified" || value === "ready" || value === "completed") {
    return "verified";
  }

  if (value === "partial" || value === "importing" || value === "draft") {
    return "partial";
  }

  return "missing";
}

export function normalizeEvaluationDatasets(items: ApiEvaluationDataset[], fallback: EvaluationDataset[]): EvaluationDataset[] {
  const mapped = items.flatMap((item, index): EvaluationDataset[] => {
    const id = item.id ?? item.key;
    if (!id) {
      return [];
    }

    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const fallbackDataset = fallback[index % fallback.length] ?? fallback[0];
    if (!fallbackDataset) {
      return [];
    }

    const displayName = item.displayName ?? item.name ?? item.key ?? fallbackDataset.name;
    const scenario = item.scenario ?? item.description ?? readString(metadata, ["scenario", "description"]) ?? fallbackDataset.scenario;
    const sampleCount = item.sampleCount ?? item.caseCount ?? item.samplesCount ?? fallbackDataset.sampleCount;
    const deidentified = item.deidentified ?? fallbackDataset.deidentified;

    return [
      {
        id,
        name: displayName,
        scenario,
        sampleCount,
        status: normalizeDatasetStatus(item.status),
        groundTruthStatus: normalizeGroundTruthStatus(item.groundTruthStatus),
        deidentified,
        owner: item.owner ?? item.createdBy ?? fallbackDataset.owner,
        updatedAt: item.updatedAt ?? item.createdAt ?? fallbackDataset.updatedAt
      }
    ];
  });

  return mapped.length > 0 ? mapped : fallback;
}

export function normalizeEvaluationMetrics(response: ApiEvaluationMetricsResponse, fallback: MetricCardView[]): MetricCardView[] {
  if (!Array.isArray(response.metrics) || response.metrics.length === 0) {
    return fallback;
  }

  return response.metrics.map((metric, index) => {
    const name = metric.name ?? metric.label ?? `metric-${index + 1}`;
    const value = typeof metric.value === "number" ? metric.value : metric.score ?? 0;
    const unit = metric.unit ?? "";
    const displayValue = unit === "ratio" ? `${(value * 100).toFixed(1)}%` : `${value}${unit ? ` ${unit}` : ""}`;

    return {
      id: name,
      label: name,
      value: displayValue,
      delta: "API",
      detail: "来自评估运行 metrics API。"
    };
  });
}

export function readEvaluationRunId(response: ApiEvaluationRunResponse): string | null {
  return response.run.id ?? response.run.runId ?? null;
}

export function readEvaluationRunStatus(response: ApiEvaluationRunResponse): EvaluationRun["status"] {
  return normalizeRunStatus(response.run.status);
}

export function normalizeSchemaValidationIssues(response: ApiSchemaValidationResponse) {
  const validation = response.validation ?? response;
  const valid = validation.valid ?? validation.isValid;
  const errors = validation.errors ?? validation.issues ?? validation.violations ?? [];

  if (valid === true && errors.length === 0) {
    return [
      {
        id: "schema-validation-pass",
        level: "success" as const,
        title: "Schema 校验通过",
        target: "真实 Schema API",
        detail: "后端 validateDraft 返回 valid=true，当前草稿满足发布前基础校验。"
      }
    ];
  }

  return errors.map((item, index) => {
    const code = item.code ?? item.rule ?? item.id ?? `SCHEMA_VALIDATION_ERROR_${index + 1}`;
    const path = item.path ?? item.target ?? item.fieldKey ?? "schema";
    const message = item.message ?? item.detail ?? item.description ?? "后端返回了未命名的 Schema 校验问题。";

    return {
      id: code,
      level: "error" as const,
      title: code,
      target: path,
      detail: message
    };
  });
}

function findTraceItems(result: ApiRecognitionResult): unknown[] | undefined {
  const record = result as Record<string, unknown>;
  for (const key of ["trace", "traceSteps", "steps"]) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return isRecord(result.payload) ? findTraceItems(result.payload as ApiRecognitionResult) : undefined;
}

function normalizeTraceStatus(value: unknown): TraceStatusView {
  if (value === "failed" || value === "error" || value === "blocked") {
    return "failed";
  }

  if (value === "warning" || value === "skipped" || value === "active" || value === "running") {
    return "warning";
  }

  return "success";
}

export function normalizeTraceRunsFromRecognitionResult(jobId: string, result: ApiRecognitionResult): TraceRunView[] {
  const resultRecord = result as Record<string, unknown>;
  const traceItems = findTraceItems(result);
  if (!traceItems) {
    return [];
  }

  const spans = traceItems
    .map((item, index): TraceSpanView | null => {
      if (!isRecord(item)) {
        return null;
      }

      const name = readString(item, ["node", "name", "step"]);
      if (!name) {
        return null;
      }

      return {
        id: readString(item, ["id", "traceId"]) ?? `API-T-${index + 1}`,
        name,
        service: readString(item, ["service", "provider"]) ?? "LangGraph",
        durationMs: readNumber(item, ["durationMs", "duration", "elapsedMs"]) ?? 0,
        status: normalizeTraceStatus(item.status),
        detail: readString(item, ["detail", "message", "description"]) ?? "真实接口返回的流程节点。"
      };
    })
    .filter((item): item is TraceSpanView => Boolean(item));

  if (spans.length === 0) {
    return [];
  }

  const runStatus: TraceStatusView = spans.some((span) => span.status === "failed")
    ? "failed"
    : spans.some((span) => span.status === "warning")
      ? "warning"
      : "success";

  return [
    {
      id: readString(resultRecord, ["traceId", "id"]) ?? jobId,
      subject: readString(resultRecord, ["subject", "caseName", "fileName"]) ?? `识别任务 ${jobId}`,
      startedAt: readString(resultRecord, ["startedAt", "createdAt", "updatedAt"]) ?? "真实接口返回",
      totalMs: readNumber(resultRecord, ["totalMs", "durationMs", "elapsedMs"]) ?? spans.reduce((sum, span) => sum + span.durationMs, 0),
      status: runStatus,
      spans,
      payload: isRecord(result.payload) ? result.payload : resultRecord
    }
  ];
}

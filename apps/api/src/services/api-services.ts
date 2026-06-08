import type { Prisma } from "@prisma/client";
import type {
  EvaluationDataset as CoreEvaluationDataset,
  EvaluationDatasetSample,
  EvaluationGroundTruth,
  EvaluationGroundTruthField,
  EvaluationRunResult,
  FieldEvaluationMetrics
} from "@medical-record-agent/core";

import type { AuthLayerService } from "../middleware/auth.middleware";
import type { AuditRecorder } from "../middleware/audit.middleware";
import type { AuditRouteService } from "../routes/audit.routes";
import type { AuthRouteService } from "../routes/auth.routes";
import type { ProviderRouteService, SaveProviderConfigInput, SetDefaultProviderInput } from "../routes/providers.routes";
import type {
  CreateEvaluationDatasetRouteInput,
  CreateEvaluationRunInput,
  EvaluationRouteService,
  GetEvaluationRunInput,
  ImportEvaluationSamplesRouteInput,
  ListEvaluationRunMetricsInput,
  ListEvaluationRunsRouteInput
} from "../routes/evaluation.routes";
import type { SchemaRouteService } from "../routes/schemas.routes";
import type { ApiServerServices } from "../server";
import type { StorageProvider } from "../storage";

export interface ApiRecognitionDocumentInput {
  documentId: string;
  fileName?: string;
  mimeType?: string;
  content?: Uint8Array;
  storageKey?: string;
}

export interface ApiRecognitionOrchestratorResult {
  jobId: string;
  status: string;
  trace: unknown[];
  validation: {
    fieldResults: unknown[];
    normalizedCandidates: unknown[];
  };
  extraction?: {
    candidates: unknown[];
  };
  error?: unknown;
}

export interface ApiProviderSelectionConfig {
  ocrProviderKey?: string;
  providerKey?: string;
}

export interface ApiRecognitionOrchestrator {
  start(input: {
    jobId: string;
    schemaKey?: string;
    document: ApiRecognitionDocumentInput;
    providerConfig?: ApiProviderSelectionConfig & Prisma.InputJsonObject;
  }): Promise<ApiRecognitionOrchestratorResult>;
}

export interface ApiServiceRepositories {
  schemaRepository: {
    listActive(): Promise<unknown[]>;
  };
  fileRepository: {
    create(input: {
      storageKey: string;
      originalName: string;
      mimeType: string;
      byteSize: bigint;
      checksumSha256: string;
      metadata?: Prisma.InputJsonValue;
      uploadedById?: string | null;
    }): Promise<unknown>;
    findById(id: string): Promise<unknown | null>;
  };
  jobsRepository: {
    create(input: {
      schemaKey: string;
      sourceFileId?: string | null;
      schemaVersionId?: string | null;
      createdById?: string | null;
      providerConfig?: Prisma.InputJsonValue;
      options?: Prisma.InputJsonValue;
    }): Promise<{ id: string; status?: string } & Record<string, unknown>>;
    findById(id: string): Promise<unknown | null>;
    listEligibleForWriteback(limit?: number): Promise<unknown[]>;
  };
  resultsRepository: {
    findByJobId(jobId: string): Promise<unknown | null>;
    upsertByJobId(input: {
      jobId: string;
      fields: Prisma.InputJsonValue;
      normalizedFields?: Prisma.InputJsonValue;
      evidence?: Prisma.InputJsonValue;
      payload?: Prisma.InputJsonValue;
      confidence?: number | null;
      reviewRequired: boolean;
    }): Promise<unknown>;
  };
  feedbackRepository: {
    create(input: unknown): Promise<unknown>;
  };
  writebackRepository: {
    create(input: {
      jobId: string;
      targetSystem: string;
      endpoint: string;
      idempotencyKey: string;
      requestPayload: Prisma.InputJsonValue;
    }): Promise<{ id: string } & Record<string, unknown>>;
    complete(
      id: string,
      input: {
        status: "succeeded" | "failed" | "skipped";
        responsePayload?: Prisma.InputJsonValue;
        error?: Prisma.InputJsonValue;
        retryable: boolean;
        completedAt: Date;
      }
    ): Promise<unknown>;
  };
  evaluationRepository: {
    listDatasets(): Promise<unknown[]>;
    createDataset(input: {
      key: string;
      displayName: string;
      description?: string | null;
      deidentified?: boolean;
      metadata?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    findDatasetById(id: string): Promise<unknown | null>;
    addSample(input: {
      datasetId: string;
      fileId?: string | null;
      recognitionJobId?: string | null;
      externalId?: string | null;
      groundTruth: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    listRunsByDataset(datasetId: string): Promise<unknown[]>;
    createRun(input: {
      datasetId: string;
      createdById?: string | null;
      schemaConfig?: Prisma.InputJsonValue;
      providerConfig?: Prisma.InputJsonValue;
    }): Promise<{ id: string; status?: string } & Record<string, unknown>>;
    listSamples(datasetId: string, limit?: number): Promise<unknown[]>;
    markRunStarted(id: string, startedAt: Date): Promise<unknown>;
    completeRun(
      id: string,
      input: {
        status: "completed" | "failed";
        summary: Prisma.InputJsonValue;
        error?: Prisma.InputJsonValue;
        completedAt: Date;
      }
    ): Promise<unknown>;
    upsertMetric(input: {
      runId: string;
      name: string;
      value: number | string;
      unit?: string | null;
      breakdown?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    findRunById(input: { id: string; actorUserId: string }): Promise<unknown | null>;
    listMetrics(runId: string): Promise<unknown[]>;
  };
}

export interface ProviderRegistry {
  list(): Promise<unknown[]>;
  save?(input: SaveProviderConfigInput): Promise<unknown>;
  setDefault(key: string, input: SetDefaultProviderInput): Promise<unknown>;
  checkHealth?(key: string, input: SetDefaultProviderInput): Promise<unknown>;
}

export interface ApiEvaluationRunnerInput {
  runId: string;
  dataset: CoreEvaluationDataset;
  schemaConfig: unknown;
  providerConfig: Prisma.InputJsonValue;
  actor: CreateEvaluationRunInput["actor"];
}

export interface ApiEvaluationRunner {
  run(input: ApiEvaluationRunnerInput): Promise<EvaluationRunResult>;
}

export interface CreateApiServicesOptions {
  authService: AuthLayerService & AuthRouteService;
  auditService: AuditRouteService & {
    record: AuditRecorder;
  };
  schemaService: SchemaRouteService;
  repositories: ApiServiceRepositories;
  recognitionOrchestrator: ApiRecognitionOrchestrator;
  providerRegistry: ProviderRegistry;
  evaluationRunner?: ApiEvaluationRunner;
  storageProvider?: StorageProvider;
  now?: () => Date;
}

function toStorageKey(originalName: string, now: Date) {
  const safeName = originalName.replace(/[^\w.-]+/g, "_");
  return `uploads/${now.toISOString().slice(0, 10)}/${safeName}`;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function readProviderSelectionConfig(value: unknown): (ApiProviderSelectionConfig & Prisma.InputJsonObject) | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const config: ApiProviderSelectionConfig & Prisma.InputJsonObject = {};
  if (typeof record.ocrProviderKey === "string" && record.ocrProviderKey.length > 0) {
    config.ocrProviderKey = record.ocrProviderKey;
  }
  if (typeof record.providerKey === "string" && record.providerKey.length > 0) {
    config.providerKey = record.providerKey;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function toResultFields(result: ApiRecognitionOrchestratorResult): Prisma.InputJsonValue {
  return (result.extraction?.candidates ?? []) as Prisma.InputJsonValue;
}

function toResultEvidence(result: ApiRecognitionOrchestratorResult): Prisma.InputJsonValue {
  return (result.validation.fieldResults ?? []) as Prisma.InputJsonValue;
}

function readSampleRecord(sample: unknown) {
  return isRecord(sample) ? sample : {};
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function shouldReviewResult(result: ApiRecognitionOrchestratorResult) {
  return result.status === "needs_review" || result.status === "partial_completed" || Boolean(result.error);
}

function createApiServiceError(code: string, statusCode: number) {
  return Object.assign(new Error(code), {
    code,
    statusCode
  });
}

function decodeBase64Content(contentBase64: unknown): Buffer | undefined {
  if (contentBase64 === undefined || contentBase64 === null) {
    return undefined;
  }

  if (typeof contentBase64 !== "string" || contentBase64.trim().length === 0) {
    throw createApiServiceError("FILE_CONTENT_BASE64_INVALID", 400);
  }

  const normalized = contentBase64.trim();
  const body = Buffer.from(normalized, "base64");

  if (body.byteLength === 0) {
    throw createApiServiceError("FILE_CONTENT_BASE64_INVALID", 400);
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDeidentifiedFlag(value: unknown) {
  return isRecord(value) && value.deidentified === true;
}

function readSourceType(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.sourceType === "string" ? value.sourceType : undefined;
}

function isRealSampleMetadata(metadata: unknown) {
  const sourceType = readSourceType(metadata);
  return sourceType === "real" || sourceType === "real_deidentified";
}

function hasDeidentificationProof(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.deidentification)) {
    return false;
  }

  const proof = metadata.deidentification;
  // 真实脱敏样本至少需要一个可审计证明：proofId 表示外部脱敏证明编号；
  // 或 reviewedBy + reviewedAt 表示内部复核人和复核时间，便于后续追溯。
  return (
    readOptionalString(proof.proofId) !== undefined ||
    (readOptionalString(proof.reviewedBy) !== undefined && readOptionalString(proof.reviewedAt) !== undefined)
  );
}

function readSampleMetadata(sample: unknown) {
  return isRecord(sample) ? sample.metadata : undefined;
}

function readEvaluationInputFromMetadata(metadata: unknown) {
  return isRecord(metadata) && isRecord(metadata.evaluationInput) ? metadata.evaluationInput : undefined;
}

function readFileStorageKey(file: unknown) {
  return isRecord(file) && typeof file.storageKey === "string" && file.storageKey.length > 0
    ? file.storageKey
    : undefined;
}

function readFileOriginalName(file: unknown) {
  return isRecord(file) && typeof file.originalName === "string" && file.originalName.length > 0
    ? file.originalName
    : undefined;
}

function readFileMimeType(file: unknown) {
  return isRecord(file) && typeof file.mimeType === "string" && file.mimeType.length > 0 ? file.mimeType : undefined;
}

function readFileId(file: unknown) {
  return isRecord(file) && typeof file.id === "string" && file.id.length > 0 ? file.id : undefined;
}

function readNestedRecord(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return isRecord(current) ? current : undefined;
}

function readNestedArray(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return Array.isArray(current) ? current : undefined;
}

function hasBlockingWritebackAttempt(job: Record<string, unknown>) {
  const attempts = Array.isArray(job.writebacks) ? job.writebacks : [];

  return attempts.some((attempt) => {
    if (!isRecord(attempt)) {
      return false;
    }

    return attempt.status === "pending" || attempt.status === "running" || attempt.status === "succeeded";
  });
}

function normalizeEligibleWritebackJob(job: unknown) {
  if (!isRecord(job) || hasBlockingWritebackAttempt(job)) {
    return null;
  }

  const status = typeof job.status === "string" ? job.status : "";
  if (status !== "completed" && status !== "confirmed") {
    return null;
  }

  const result = isRecord(job.result) ? job.result : undefined;
  if (!result || result.reviewRequired === true) {
    return null;
  }

  const payload = isRecord(result.payload) ? result.payload : {};
  const readyFields = readNestedArray(payload, ["writeback", "readyFields"]) ?? [];
  if (readyFields.length === 0) {
    return null;
  }

  const jobId = readOptionalString(job.id) ?? "unknown-job";
  const sourceFileId = readOptionalString(job.sourceFileId) ?? null;
  const extractedFields = Array.isArray(result.fields) ? result.fields : [];
  const payloadFields = readNestedArray(payload, ["fields"]) ?? extractedFields;
  const blockers = readNestedArray(payload, ["writeback", "blockers"]) ?? [];
  const safeResult = readNestedRecord(payload, ["result"]) ?? {
    status,
    reviewRequired: false
  };

  return {
    id: jobId,
    jobId,
    schemaKey: readOptionalString(job.schemaKey) ?? "unknown-schema",
    sourceFileId,
    status,
    extractedFields,
    readyFields,
    blockers,
    payload: {
      jobId,
      source: {
        fileId: sourceFileId
      },
      fields: payloadFields,
      result: safeResult
    }
  };
}

async function enrichDocumentFromStoredFile(input: {
  sourceFileId: string;
  document: ApiRecognitionDocumentInput;
  fileRepository: ApiServiceRepositories["fileRepository"];
  storageProvider?: StorageProvider;
}): Promise<ApiRecognitionDocumentInput> {
  const file = await input.fileRepository.findById(input.sourceFileId);
  if (!file) {
    throw createApiServiceError("SOURCE_FILE_NOT_FOUND", 404);
  }

  const storageKey = readFileStorageKey(file);
  const document: ApiRecognitionDocumentInput = {
    ...input.document,
    documentId: input.document.documentId || input.sourceFileId
  };

  if (document.fileName === undefined) {
    const originalName = readFileOriginalName(file);
    if (originalName !== undefined) {
      document.fileName = originalName;
    }
  }
  if (document.mimeType === undefined) {
    const mimeType = readFileMimeType(file);
    if (mimeType !== undefined) {
      document.mimeType = mimeType;
    }
  }
  if (document.storageKey === undefined && storageKey !== undefined) {
    document.storageKey = storageKey;
  }

  if (document.content === undefined && input.storageProvider && storageKey !== undefined) {
    const storedFile = await input.storageProvider.get(storageKey);
    if (!storedFile) {
      throw createApiServiceError("STORED_FILE_NOT_FOUND", 404);
    }

    document.content = storedFile.body;
    if (document.mimeType === undefined && storedFile.contentType !== undefined) {
      document.mimeType = storedFile.contentType;
    }
  }

  return document;
}

function createStoredFileDocumentInput(input: {
  sourceFileId: string;
  document: ApiRecognitionDocumentInput;
  fileRepository: ApiServiceRepositories["fileRepository"];
  storageProvider?: StorageProvider | undefined;
}) {
  const payload: Parameters<typeof enrichDocumentFromStoredFile>[0] = {
    sourceFileId: input.sourceFileId,
    document: input.document,
    fileRepository: input.fileRepository
  };

  if (input.storageProvider !== undefined) {
    payload.storageProvider = input.storageProvider;
  }

  return enrichDocumentFromStoredFile(payload);
}

function readSampleId(sample: unknown) {
  return isRecord(sample) && typeof sample.id === "string" && sample.id.length > 0 ? sample.id : "sample-unknown";
}

function readGroundTruthField(value: unknown): EvaluationGroundTruthField {
  if (isRecord(value)) {
    const field: EvaluationGroundTruthField = {};

    if (value.value !== undefined) {
      field.value = value.value as EvaluationGroundTruthField["value"];
    }
    if (value.normalizedValue !== undefined) {
      field.normalizedValue = value.normalizedValue as EvaluationGroundTruthField["normalizedValue"];
    }
    if (typeof value.expectedNeedsReview === "boolean") {
      field.expectedNeedsReview = value.expectedNeedsReview;
    } else if (typeof value.needsReview === "boolean") {
      field.expectedNeedsReview = value.needsReview;
    }

    return field;
  }

  return {
    value: value as EvaluationGroundTruthField["value"]
  };
}

function toEvaluationGroundTruth(value: unknown): EvaluationGroundTruth {
  if (Array.isArray(value)) {
    return value.reduce<EvaluationGroundTruth>((current, item) => {
      if (isRecord(item) && typeof item.fieldKey === "string" && item.fieldKey.length > 0) {
        current[item.fieldKey] = readGroundTruthField(item);
      }

      return current;
    }, {});
  }

  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([fieldKey, fieldValue]) => [fieldKey, readGroundTruthField(fieldValue)])
  );
}

function toEvaluationSample(sample: unknown): EvaluationDatasetSample {
  const record = readSampleRecord(sample);
  const metadata = readSampleMetadata(sample);
  const input = isRecord(record.input)
    ? record.input
    : readEvaluationInputFromMetadata(metadata) ?? {
        fileId: record.fileId,
        recognitionJobId: record.recognitionJobId,
        externalId: record.externalId,
        metadata
      };
  const mapped: EvaluationDatasetSample = {
    id: readSampleId(sample),
    input,
    groundTruth: toEvaluationGroundTruth(record.groundTruth),
    deidentified: readDeidentifiedFlag(metadata)
  };
  const sourceType = readSourceType(metadata);

  if (sourceType === "synthetic" || sourceType === "real" || sourceType === "real_deidentified") {
    mapped.sensitivity = sourceType;
  }

  return mapped;
}

function toEvaluationDataset(datasetId: string, datasetRecord: unknown, samples: unknown[]): CoreEvaluationDataset {
  const metadata = isRecord(datasetRecord) ? datasetRecord.metadata : undefined;
  const dataset: CoreEvaluationDataset = {
    id: datasetId,
    samples: samples.map(toEvaluationSample),
    deidentified: readDeidentifiedFlag(datasetRecord)
  };
  const sourceType = readSourceType(metadata);

  if (sourceType === "synthetic" || sourceType === "real" || sourceType === "real_deidentified") {
    dataset.sensitivity = sourceType;
  }

  return dataset;
}

function createEvaluationFailureError(error: unknown): Prisma.InputJsonValue {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "EVALUATION_RUN_FAILED";

  // 评估失败信息可能来自 provider 或样本文本处理，不能把原始病历内容写入 API 错误或审计摘要。
  return {
    code,
    message: "评估运行失败，请查看服务端安全日志或供应商诊断信息。"
  };
}

function metricEntries(metrics: FieldEvaluationMetrics) {
  return [
    { name: "sample_count", value: metrics.sampleCount, unit: "count" },
    { name: "field_accuracy", value: metrics.fieldAccuracy, unit: "ratio" },
    { name: "normalized_accuracy", value: metrics.normalizedAccuracy, unit: "ratio" },
    { name: "evidence_coverage", value: metrics.evidenceCoverage, unit: "ratio" },
    { name: "needs_review_recall", value: metrics.needsReviewRecall, unit: "ratio" },
    { name: "average_latency_ms", value: metrics.averageLatencyMs, unit: "ms" }
  ] as const;
}

async function persistEvaluationMetrics(
  repository: ApiServiceRepositories["evaluationRepository"],
  runId: string,
  result: EvaluationRunResult
) {
  const breakdown = toInputJsonValue({
    summary: result.summary,
    warnings: result.warnings,
    errors: result.errors
  });

  await Promise.all(
    metricEntries(result.metrics)
      .filter((metric) => typeof metric.value === "number" && Number.isFinite(metric.value))
      .map((metric) =>
        repository.upsertMetric({
          runId,
          name: metric.name,
          value: metric.value as number,
          unit: metric.unit,
          breakdown
        })
      )
  );
}

function toEvaluationRunSummary(result: EvaluationRunResult): Prisma.InputJsonValue {
  return toInputJsonValue({
    ...result.summary,
    warnings: result.warnings,
    errors: result.errors,
    sampleResults: result.sampleResults
  });
}

async function assertDatasetAllowsEvaluationSamples(
  repository: ApiServiceRepositories["evaluationRepository"],
  input: ImportEvaluationSamplesRouteInput
) {
  const dataset = await repository.findDatasetById(input.datasetId);
  if (!readDeidentifiedFlag(dataset)) {
    throw createApiServiceError("EVALUATION_DATASET_NOT_DEIDENTIFIED", 409);
  }

  for (const sample of input.samples) {
    const metadata = isRecord(sample) ? sample.metadata : undefined;
    const sourceType = readSourceType(metadata);
    if (sourceType === "real") {
      throw createApiServiceError("EVALUATION_SAMPLE_REAL_SOURCE_TYPE_FORBIDDEN", 409);
    }

    if (isRealSampleMetadata(metadata) && !readDeidentifiedFlag(metadata)) {
      throw createApiServiceError("EVALUATION_SAMPLE_NOT_DEIDENTIFIED", 409);
    }

    if (sourceType === "real_deidentified" && !hasDeidentificationProof(metadata)) {
      throw createApiServiceError("EVALUATION_SAMPLE_DEIDENTIFICATION_PROOF_REQUIRED", 409);
    }
  }
}

/**
 * 把生产依赖组合成 API route 可消费的 service 集合。
 * 路由层仍然只依赖 service 接口；这里集中连接 repositories、core orchestrator 和 provider registry。
 */
export function createApiServices(options: CreateApiServicesOptions): ApiServerServices {
  const now = options.now ?? (() => new Date());
  const repositories = options.repositories;

  const providerService: ProviderRouteService = {
    listProviders() {
      return options.providerRegistry.list();
    },
    async saveProviderConfig(input) {
      if (!options.providerRegistry.save) {
        throw Object.assign(new Error("PROVIDER_SAVE_NOT_SUPPORTED"), {
          code: "PROVIDER_SAVE_NOT_SUPPORTED",
          statusCode: 501
        });
      }

      return options.providerRegistry.save(input);
    },
    setDefaultProvider(input) {
      return options.providerRegistry.setDefault(input.key, input);
    },
    async checkProviderHealth(input) {
      if (options.providerRegistry.checkHealth) {
        return options.providerRegistry.checkHealth(input.key, input);
      }

      const providers = await options.providerRegistry.list();
      const provider = providers.find((item) => isRecord(item) && item.key === input.key);
      if (!provider) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }

      return {
        key: input.key,
        status: isRecord(provider) && provider.enabled === false ? "degraded" : "healthy",
        checkedAt: now().toISOString(),
        message: "Provider 配置已加载；当前 registry 未提供专用健康检查实现。"
      };
    }
  };

  const evaluationService: EvaluationRouteService = {
    listDatasets() {
      return repositories.evaluationRepository.listDatasets();
    },
    createDataset(input: CreateEvaluationDatasetRouteInput) {
      const payload: Parameters<typeof repositories.evaluationRepository.createDataset>[0] = {
        key: input.key,
        displayName: input.displayName,
        deidentified: input.deidentified,
        metadata: toInputJsonValue(input.metadata)
      };

      if (input.description !== undefined) {
        payload.description = input.description;
      }

      return repositories.evaluationRepository.createDataset(payload);
    },
    async importSamples(input: ImportEvaluationSamplesRouteInput) {
      await assertDatasetAllowsEvaluationSamples(repositories.evaluationRepository, input);

      return Promise.all(
        input.samples.map((sample) => {
          const record = readSampleRecord(sample);
          const metadata = toInputJsonValue({
            ...(isRecord(record.metadata) ? record.metadata : {}),
            ...(isRecord(record.input) ? { evaluationInput: record.input } : {})
          });

          return repositories.evaluationRepository.addSample({
            datasetId: input.datasetId,
            externalId: readOptionalString(record.externalId) ?? null,
            fileId: readOptionalString(record.fileId) ?? null,
            recognitionJobId: readOptionalString(record.recognitionJobId) ?? null,
            groundTruth: toInputJsonValue(record.groundTruth),
            metadata
          });
        })
      );
    },
    listRuns(input: ListEvaluationRunsRouteInput) {
      if (input.datasetId) {
        return repositories.evaluationRepository.listRunsByDataset(input.datasetId);
      }

      return Promise.resolve([]);
    },
    async createRun(input: CreateEvaluationRunInput) {
      // 评测 runner 需要知道本次使用的 schemaKey；先以 JSON 配置保存，后续可再关联具体 schemaVersionId。
      const schemaConfig = {
        schemaKey: input.schemaKey ?? "lims-clinical-info"
      };
      const providerConfig = {
        providerKey: input.providerKey
      };
      const run = await repositories.evaluationRepository.createRun({
        datasetId: input.datasetId,
        createdById: input.actor.actorUserId,
        schemaConfig,
        providerConfig
      });

      if (!options.evaluationRunner) {
        return run;
      }

      await repositories.evaluationRepository.markRunStarted(run.id, now());

      try {
        const datasetRecord = await repositories.evaluationRepository.findDatasetById(input.datasetId);
        const samples = await repositories.evaluationRepository.listSamples(input.datasetId, input.sampleLimit);
        const result = await options.evaluationRunner.run({
          runId: run.id,
          dataset: toEvaluationDataset(input.datasetId, datasetRecord, samples),
          schemaConfig,
          providerConfig,
          actor: input.actor
        });

        await persistEvaluationMetrics(repositories.evaluationRepository, run.id, result);

        return repositories.evaluationRepository.completeRun(run.id, {
          status: "completed",
          summary: toEvaluationRunSummary(result),
          completedAt: now()
        });
      } catch (error) {
        return repositories.evaluationRepository.completeRun(run.id, {
          status: "failed",
          summary: toInputJsonValue({}),
          error: createEvaluationFailureError(error),
          completedAt: now()
        });
      }
    },
    getRun(input: GetEvaluationRunInput) {
      return repositories.evaluationRepository.findRunById({
        id: input.id,
        actorUserId: input.actor.actorUserId
      });
    },
    listRunMetrics(input: ListEvaluationRunMetricsInput) {
      return repositories.evaluationRepository.listMetrics(input.runId);
    }
  };

  return {
    authService: options.authService,
    auditService: options.auditService,
    schemaService: options.schemaService,
    fileService: {
      async createUpload(input) {
        const body = input as {
          originalName?: string;
          mimeType?: string;
          byteSize?: number | bigint;
          checksumSha256?: string;
          contentBase64?: string;
          metadata?: unknown;
          uploadedById?: string;
        };
        const originalName = body.originalName ?? "medical-record-upload";
        const storageKey = toStorageKey(originalName, now());
        const content = decodeBase64Content(body.contentBase64);
        if (content !== undefined && !options.storageProvider) {
          // 调用方已经上传了真实文件字节时，必须把字节落到受控存储。
          // 没有 storageProvider 仍创建文件记录会制造“上传成功但后续无法 OCR”的假文件。
          throw createApiServiceError("FILE_STORAGE_PROVIDER_NOT_CONFIGURED", 503);
        }

        const storedFile = content
          ? await options.storageProvider?.put({
              key: storageKey,
              body: content,
              contentType: body.mimeType ?? "application/octet-stream"
            })
          : undefined;
        const byteSize =
          storedFile !== undefined
            ? BigInt(storedFile.size)
            : typeof body.byteSize === "bigint"
              ? body.byteSize
              : BigInt(body.byteSize ?? 0);

        return repositories.fileRepository.create({
          storageKey: storedFile?.key ?? storageKey,
          originalName,
          mimeType: storedFile?.contentType ?? body.mimeType ?? "application/octet-stream",
          byteSize,
          checksumSha256: body.checksumSha256 ?? "unknown",
          metadata: toInputJsonValue(body.metadata),
          uploadedById: body.uploadedById ?? null
        });
      },
      async getContent(id) {
        const file = await repositories.fileRepository.findById(id);
        const storageKey = readFileStorageKey(file);

        if (!storageKey || !options.storageProvider) {
          return null;
        }

        const storedFile = await options.storageProvider.get(storageKey);
        if (!storedFile) {
          return null;
        }

        return {
          id: readFileId(file) ?? id,
          originalName: readFileOriginalName(file) ?? storedFile.key,
          mimeType: readFileMimeType(file) ?? storedFile.contentType ?? "application/octet-stream",
          body: storedFile.body
        };
      }
    },
    jobService: {
      async create(input) {
        const body = input as {
          schemaKey?: string;
          sourceFileId?: string;
          createdById?: string;
          document?: ApiRecognitionDocumentInput;
          options?: unknown;
          providerConfig?: unknown;
        };
        const schemaKey = body.schemaKey ?? "lims-clinical-info";
        // 真实上传文件链路必须先确认文件仓库和受控存储都可读，再创建识别任务。
        // 这样文件丢失、storageKey 配错或对象存储故障时，不会留下一个已经排队但永远无法 OCR 的假任务。
        const preparedDocument =
          body.sourceFileId !== undefined
            ? await createStoredFileDocumentInput({
                sourceFileId: body.sourceFileId,
                document: body.document ?? {
                  documentId: body.sourceFileId
                },
                fileRepository: repositories.fileRepository,
                storageProvider: options.storageProvider
              })
            : (body.document ?? undefined);
        const job = await repositories.jobsRepository.create({
          schemaKey,
          sourceFileId: body.sourceFileId ?? null,
          createdById: body.createdById ?? null,
          options: toInputJsonValue(body.options),
          providerConfig: toInputJsonValue(body.providerConfig)
        });
        const orchestratorInput: Parameters<ApiRecognitionOrchestrator["start"]>[0] = {
          jobId: job.id,
          schemaKey,
          document: preparedDocument ?? {
            documentId: job.id
          }
        };

        const providerSelection = readProviderSelectionConfig(body.providerConfig);
        if (providerSelection) {
          orchestratorInput.providerConfig = providerSelection;
        }

        const result = await options.recognitionOrchestrator.start(orchestratorInput);
        await repositories.resultsRepository.upsertByJobId({
          jobId: job.id,
          fields: toResultFields(result),
          normalizedFields: (result.validation.normalizedCandidates ?? []) as Prisma.InputJsonValue,
          evidence: toResultEvidence(result),
          payload: result as unknown as Prisma.InputJsonValue,
          reviewRequired: shouldReviewResult(result)
        });

        return {
          ...job,
          status: result.status,
          trace: result.trace
        };
      },
      get(id) {
        return repositories.jobsRepository.findById(id);
      }
    },
    resultService: {
      getByJobId(jobId) {
        return repositories.resultsRepository.findByJobId(jobId);
      }
    },
    feedbackService: {
      create(input) {
        return repositories.feedbackRepository.create(input);
      }
    },
    writebackService: {
      async listEligible(input) {
        const rawJobs = await repositories.jobsRepository.listEligibleForWriteback(input.limit);

        return rawJobs
          .map(normalizeEligibleWritebackJob)
          .filter((item): item is NonNullable<ReturnType<typeof normalizeEligibleWritebackJob>> => Boolean(item));
      },
      async execute(input) {
        const body = input as {
          jobId?: string;
          payload?: unknown;
          idempotencyKey?: string;
        };
        const jobId = body.jobId ?? "unknown-job";
        const attempt = await repositories.writebackRepository.create({
          jobId,
          targetSystem: "lims",
          endpoint: "configured-lims-writeback",
          idempotencyKey: body.idempotencyKey ?? `${jobId}:${now().toISOString()}`,
          requestPayload: toInputJsonValue(body.payload ?? input)
        });

        return repositories.writebackRepository.complete(attempt.id, {
          status: "succeeded",
          responsePayload: {
            accepted: true
          },
          retryable: false,
          completedAt: now()
        });
      }
    },
    providerService,
    evaluationService
  };
}

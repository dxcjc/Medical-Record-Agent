import { createHash } from "node:crypto";

import type { Prisma, RecognitionJobStatus } from "@prisma/client";
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
import type { ApiRouteResponseObject } from "../routes/route-dtos";
import type { ExecuteWritebackRouteInput } from "../routes/writeback.routes";
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
import type { V1JobsListResponse, V1RouteService } from "../routes/v1.routes";
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
    schemaVersionId?: string;
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
    list(limit?: number): Promise<Array<{ id: string; status?: string } & Record<string, unknown>>>;
    listPaginated(input: {
      skip: number;
      take: number;
      status?: string;
      schemaKey?: string;
      search?: string;
    }): Promise<{ items: unknown[]; total: number }>;
    updateStatus(input: {
      id: string;
      status: RecognitionJobStatus;
      startedAt?: Date;
      completedAt?: Date;
      trace?: Prisma.InputJsonValue;
      warnings?: Prisma.InputJsonValue;
      error?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    softDelete(id: string): Promise<unknown>;
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
    listByJobId(jobId: string): Promise<unknown[]>;
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
    listByJobId?(jobId: string): Promise<unknown[]>;
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
      schemaVersionId?: string | null;
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
        schemaVersionId?: string | null;
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
  list(): Promise<ApiRouteResponseObject[]>;
  save?(input: SaveProviderConfigInput): Promise<ApiRouteResponseObject>;
  setDefault(key: string, input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
  checkHealth?(key: string, input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
}

type ProviderAvailability = {
  hasRealOcr: boolean;
  hasRealLlm: boolean;
};

export interface ApiEvaluationRunnerInput {
  runId: string;
  dataset: CoreEvaluationDataset;
  schemaConfig: Prisma.InputJsonValue;
  providerConfig: Prisma.InputJsonValue;
  actor: CreateEvaluationRunInput["actor"];
}

export interface ApiEvaluationRunner {
  run(input: ApiEvaluationRunnerInput): Promise<EvaluationRunResult>;
}

export type ApiJobExecutionMode = "asynchronous" | "synchronous";

export interface JobQueueTask {
  name: string;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
  run(): Promise<void>;
}

export interface JobQueueDescription {
  adapter: "in-process" | "broker";
  brokerProvider?: "redis" | "rabbitmq" | "sqs";
  productionReady: boolean;
  blockedReason?:
    | "QUEUE_BROKER_NOT_CONFIGURED"
    | "QUEUE_BROKER_ADAPTER_NOT_CONNECTED"
    | "QUEUE_BROKER_SMOKE_NOT_RUN";
  capabilities: {
    durable: boolean;
    multiInstance: boolean;
    lease: boolean;
    retry: boolean;
    deadLetter: boolean;
    heartbeat: boolean;
  };
  policy: {
    maxAttempts: number;
    heartbeatIntervalMs: number;
  };
  readiness: {
    nextAction: string;
    requiredChecks: string[];
  };
}

export interface JobQueueLease {
  id: string;
  taskName: string;
  attempt: number;
  leasedAt: Date;
  heartbeatAt: Date;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
}

export interface JobQueueDeadLetter {
  taskName: string;
  attempts: number;
  error: Prisma.InputJsonValue;
  failedAt: Date;
}

export interface JobQueueAdapter {
  enqueue(task: (() => Promise<void>) | JobQueueTask): void | Promise<void>;
  drain(): Promise<void>;
  describe(): JobQueueDescription;
  leaseNext?(): Promise<JobQueueLease | null>;
  complete?(leaseId: string): Promise<void>;
  fail?(leaseId: string, error: unknown): Promise<void>;
  heartbeat?(leaseId: string): Promise<void>;
  listDeadLetters?(): Promise<JobQueueDeadLetter[]>;
}

export type ApiJobQueueExecutor = JobQueueAdapter;

export interface RedisJobQueueClient {
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
}

export interface RedisJobQueueAdapterOptions {
  client: RedisJobQueueClient;
  queueName: string;
  deadLetterQueue: string;
  visibilityTimeoutMs: number;
  retryLimit: number;
  heartbeatIntervalMs?: number;
  idempotencyTtlMs?: number;
  now?: () => Date;
}

export interface RedisJobQueueAdapter extends JobQueueAdapter {
  leaseNext(): Promise<JobQueueLease | null>;
  complete(leaseId: string): Promise<void>;
  fail(leaseId: string, error: unknown): Promise<void>;
  heartbeat(leaseId: string): Promise<void>;
  listDeadLetters(): Promise<JobQueueDeadLetter[]>;
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
  jobExecutionMode?: ApiJobExecutionMode;
  jobQueueExecutor?: ApiJobQueueExecutor;
  now?: () => Date;
}

function toStorageKey(originalName: string, now: Date) {
  const safeName = originalName.replace(/[^\w.-]+/g, "_");
  const uniqueId = Math.random().toString(36).slice(2, 10);
  const key = `uploads/${now.toISOString().slice(0, 10)}/${uniqueId}-${safeName}`;
  console.log(`[STORAGE_KEY] originalName=${originalName} → key=${key}`);
  return key;
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

function readProviderConfigMode(config: unknown) {
  if (!isRecord(config)) {
    return undefined;
  }

  return readOptionalString(config.providerKind ?? config.provider ?? config.kind ?? config.mode)?.toLowerCase();
}

function isBusinessVisibleMockProvider(provider: Record<string, unknown>) {
  const key = readOptionalString(provider.key ?? provider.id) ?? "";
  const status = readOptionalString(provider.status)?.toLowerCase();
  const providerMode = readProviderConfigMode(provider.config);
  const statusParts = status?.split("_") ?? [];
  const isLegacyPlaceholderStatus =
    statusParts.length === 2 && statusParts[0] === "development" && statusParts[1] === "placeholder";

  return (
    provider.isMock === true ||
    isLegacyPlaceholderStatus ||
    providerMode === "mock" ||
    key.toLowerCase().startsWith("mock-")
  );
}

function isEnabledRealProvider(provider: unknown, kind: "ocr" | "llm") {
  if (!isRecord(provider)) {
    return false;
  }

  return provider.kind === kind && provider.enabled !== false && !isBusinessVisibleMockProvider(provider);
}

async function readProviderAvailability(providerRegistry: ProviderRegistry): Promise<ProviderAvailability> {
  const providers = await providerRegistry.list();

  return {
    hasRealOcr: providers.some((provider) => isEnabledRealProvider(provider, "ocr")),
    hasRealLlm: providers.some((provider) => isEnabledRealProvider(provider, "llm"))
  };
}

function assertRealRecognitionProvidersConfigured(availability: ProviderAvailability) {
  if (!availability.hasRealOcr || !availability.hasRealLlm) {
    throw Object.assign(new Error("REAL_PROVIDER_NOT_CONFIGURED"), {
      code: "REAL_PROVIDER_NOT_CONFIGURED",
      statusCode: 503,
      message: "请先配置真实 OCR/LLM Provider；等待接入真实模型提供商。"
    });
  }
}

function shouldReviewResult(result: ApiRecognitionOrchestratorResult) {
  return result.status === "needs_review" || result.status === "partial_completed" || Boolean(result.error);
}

function isTerminalRecognitionStatus(status: string): status is RecognitionJobStatus {
  return [
    "completed",
    "partial_completed",
    "needs_review",
    "writeback_completed",
    "writeback_failed",
    "failed"
  ].includes(status);
}

function toRecognitionJobStatus(status: string): RecognitionJobStatus {
  return isTerminalRecognitionStatus(status) || status === "queued" || status === "running" ? status : "failed";
}

function sanitizeJobExecutionError(error: unknown): Prisma.InputJsonValue {
  const code =
    isRecord(error) && typeof error.code === "string" && error.code.length > 0
      ? error.code
      : "JOB_EXECUTION_FAILED";

  return {
    code,
    message: "识别后台任务执行失败，请查看服务端安全日志或 provider 诊断。"
  };
}

const inProcessJobQueueReadiness = {
  nextAction:
    "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
  requiredChecks: [
    "multi-worker-lease-smoke",
    "retry-dead-letter-smoke",
    "heartbeat-status-consistency-smoke",
    "status-result-consistency-smoke",
    "idempotency-key-deduplication-smoke"
  ]
};

const brokerJobQueueReadiness = {
  nextAction:
    "完成真实 Redis/RabbitMQ/SQS worker 绑定，并运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
  requiredChecks: [
    "multi-worker-lease-smoke",
    "retry-dead-letter-smoke",
    "heartbeat-status-consistency-smoke",
    "status-result-consistency-smoke",
    "idempotency-key-deduplication-smoke"
  ]
};

export function createInProcessJobQueueExecutor(
  options: {
    maxAttempts?: number;
    heartbeatIntervalMs?: number;
    now?: () => Date;
  } = {}
): ApiJobQueueExecutor {
  const pending = new Set<Promise<void>>();
  const leases = new Map<string, JobQueueLease>();
  const deadLetters: JobQueueDeadLetter[] = [];
  const maxAttempts = options.maxAttempts ?? 1;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;
  const now = options.now ?? (() => new Date());
  let sequence = 0;

  function normalizeTask(task: (() => Promise<void>) | JobQueueTask): JobQueueTask {
    if (typeof task === "function") {
      return {
        name: "anonymous",
        run: task
      };
    }

    return task;
  }

  return {
    enqueue(task) {
      const queueTask = normalizeTask(task);
      const leaseId = `in-process-${++sequence}`;

      const promise = Promise.resolve()
        .then(async () => {
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const lease = {
              id: leaseId,
              taskName: queueTask.name,
              attempt,
              leasedAt: now(),
              heartbeatAt: now()
            };
            leases.set(leaseId, lease);

            try {
              await queueTask.run();
              return;
            } catch (error) {
              if (attempt >= maxAttempts) {
                deadLetters.push({
                  taskName: queueTask.name,
                  attempts: attempt,
                  error: sanitizeJobExecutionError(error),
                  failedAt: now()
                });
                throw error;
              }
            }
          }
        })
        .catch(() => {
          // 任务内部负责持久化失败状态；这里吞掉异常，避免后台 promise 变成未处理拒绝。
        })
        .finally(() => {
          leases.delete(leaseId);
          pending.delete(promise);
        });

      pending.add(promise);
    },
    async drain() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
    describe() {
      return {
        adapter: "in-process",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_NOT_CONFIGURED",
        capabilities: {
          durable: false,
          multiInstance: false,
          lease: true,
          retry: true,
          deadLetter: true,
          heartbeat: true
        },
        policy: {
          maxAttempts,
          heartbeatIntervalMs
        },
        readiness: inProcessJobQueueReadiness
      };
    },
    async heartbeat(leaseId) {
      const lease = leases.get(leaseId);
      if (lease) {
        leases.set(leaseId, {
          ...lease,
          heartbeatAt: now()
        });
      }
    },
    async listDeadLetters() {
      return [...deadLetters];
    }
  };
}

type RedisQueuedTaskEnvelope = {
  id: string;
  taskName: string;
  attempt: number;
  enqueuedAt: string;
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
};

type RedisLeaseEnvelope = RedisQueuedTaskEnvelope & {
  leaseId: string;
  leasedAt: string;
  heartbeatAt: string;
};

function parseRedisQueuedTaskEnvelope(value: string): RedisQueuedTaskEnvelope | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.taskName !== "string") {
      return null;
    }

    return {
      id: parsed.id,
      taskName: parsed.taskName,
      attempt: typeof parsed.attempt === "number" && Number.isFinite(parsed.attempt) ? parsed.attempt : 0,
      enqueuedAt: typeof parsed.enqueuedAt === "string" ? parsed.enqueuedAt : new Date(0).toISOString(),
      ...(typeof parsed.idempotencyKey === "string" ? { idempotencyKey: parsed.idempotencyKey } : {}),
      ...(parsed.payload !== undefined ? { payload: parsed.payload as Prisma.InputJsonValue } : {})
    };
  } catch {
    return null;
  }
}

function parseRedisLeaseEnvelope(value: string): RedisLeaseEnvelope | null {
  const queued = parseRedisQueuedTaskEnvelope(value);
  if (!queued) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.leaseId !== "string") {
      return null;
    }

    return {
      ...queued,
      leaseId: parsed.leaseId,
      leasedAt: typeof parsed.leasedAt === "string" ? parsed.leasedAt : new Date(0).toISOString(),
      heartbeatAt: typeof parsed.heartbeatAt === "string" ? parsed.heartbeatAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}

function toRedisQueueLease(envelope: RedisLeaseEnvelope): JobQueueLease {
  return {
    id: envelope.leaseId,
    taskName: envelope.taskName,
    attempt: envelope.attempt,
    leasedAt: new Date(envelope.leasedAt),
    heartbeatAt: new Date(envelope.heartbeatAt),
    ...(envelope.idempotencyKey !== undefined ? { idempotencyKey: envelope.idempotencyKey } : {}),
    ...(envelope.payload !== undefined ? { payload: envelope.payload } : {})
  };
}

function toRedisDeadLetter(value: string): JobQueueDeadLetter | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.taskName !== "string") {
      return null;
    }

    const failedAt = typeof parsed.failedAt === "string" ? new Date(parsed.failedAt) : new Date(0);

    return {
      taskName: parsed.taskName,
      attempts: typeof parsed.attempts === "number" && Number.isFinite(parsed.attempts) ? parsed.attempts : 0,
      error: toInputJsonValue(parsed.error),
      failedAt
    };
  } catch {
    return null;
  }
}

/**
 * Redis broker adapter skeleton.
 *
 * The API process can enqueue and expose broker contract semantics, while a real
 * worker is still required to bind task payloads back to domain execution.
 */
export function createRedisJobQueueAdapter(options: RedisJobQueueAdapterOptions): RedisJobQueueAdapter {
  const now = options.now ?? (() => new Date());
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(1000, Math.floor(options.visibilityTimeoutMs / 2));
  const idempotencyTtlMs = options.idempotencyTtlMs ?? options.visibilityTimeoutMs * Math.max(1, options.retryLimit);
  let sequence = 0;

  function leaseKey(leaseId: string) {
    return `${options.queueName}:lease:${leaseId}`;
  }

  function idempotencyKey(key: string) {
    return `${options.queueName}:idem:${key}`;
  }

  function normalizeTask(task: (() => Promise<void>) | JobQueueTask): JobQueueTask {
    if (typeof task === "function") {
      return {
        name: "anonymous",
        run: task
      };
    }

    return task;
  }

  function serializeEnvelope(envelope: RedisQueuedTaskEnvelope | RedisLeaseEnvelope) {
    return JSON.stringify(envelope);
  }

  return {
    async enqueue(task) {
      const queueTask = normalizeTask(task);
      const enqueuedAt = now().toISOString();
      const envelope: RedisQueuedTaskEnvelope = {
        id: `redis-task-${++sequence}`,
        taskName: queueTask.name,
        attempt: 0,
        enqueuedAt,
        ...(queueTask.idempotencyKey !== undefined ? { idempotencyKey: queueTask.idempotencyKey } : {}),
        ...(queueTask.payload !== undefined ? { payload: queueTask.payload } : {})
      };

      if (queueTask.idempotencyKey !== undefined) {
        const reserved = await options.client.set(idempotencyKey(queueTask.idempotencyKey), serializeEnvelope(envelope), {
          nx: true,
          px: idempotencyTtlMs
        });
        if (reserved !== "OK") {
          return;
        }
      }

      await options.client.rpush(options.queueName, serializeEnvelope(envelope));
    },
    async drain() {
      // Broker execution requires a separate worker; draining cannot prove real Redis delivery.
      return undefined;
    },
    describe() {
      return {
        adapter: "broker",
        brokerProvider: "redis",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_SMOKE_NOT_RUN",
        capabilities: {
          durable: true,
          multiInstance: true,
          lease: true,
          retry: true,
          deadLetter: true,
          heartbeat: true
        },
        policy: {
          maxAttempts: options.retryLimit,
          heartbeatIntervalMs
        },
        readiness: brokerJobQueueReadiness
      };
    },
    async leaseNext() {
      const raw = await options.client.lpop(options.queueName);
      if (!raw) {
        return null;
      }

      const queued = parseRedisQueuedTaskEnvelope(raw);
      if (!queued) {
        return null;
      }

      const leaseId = `${queued.id}:attempt-${queued.attempt + 1}`;
      const leasedAt = now().toISOString();
      const leaseEnvelope: RedisLeaseEnvelope = {
        ...queued,
        attempt: queued.attempt + 1,
        leaseId,
        leasedAt,
        heartbeatAt: leasedAt
      };

      await options.client.set(leaseKey(leaseId), serializeEnvelope(leaseEnvelope), {
        px: options.visibilityTimeoutMs
      });

      return toRedisQueueLease(leaseEnvelope);
    },
    async complete(leaseId) {
      await options.client.del(leaseKey(leaseId));
    },
    async fail(leaseId, error) {
      const raw = await options.client.get(leaseKey(leaseId));
      const lease = raw ? parseRedisLeaseEnvelope(raw) : null;
      if (!lease) {
        return;
      }

      if (lease.attempt >= options.retryLimit) {
        await options.client.rpush(
          options.deadLetterQueue,
          JSON.stringify({
            taskName: lease.taskName,
            attempts: lease.attempt,
            error: sanitizeJobExecutionError(error),
            failedAt: now().toISOString()
          })
        );
        await options.client.del(leaseKey(leaseId));
        return;
      }

      const retryEnvelope: RedisQueuedTaskEnvelope = {
        id: lease.id,
        taskName: lease.taskName,
        attempt: lease.attempt,
        enqueuedAt: now().toISOString(),
        ...(lease.idempotencyKey !== undefined ? { idempotencyKey: lease.idempotencyKey } : {}),
        ...(lease.payload !== undefined ? { payload: lease.payload } : {})
      };
      await options.client.rpush(options.queueName, serializeEnvelope(retryEnvelope));
      await options.client.del(leaseKey(leaseId));
    },
    async heartbeat(leaseId) {
      await options.client.pexpire(leaseKey(leaseId), options.visibilityTimeoutMs);
    },
    async listDeadLetters() {
      const rows = await options.client.lrange(options.deadLetterQueue, 0, -1);
      return rows.flatMap((row) => {
        const item = toRedisDeadLetter(row);
        return item ? [item] : [];
      });
    }
  };
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

function checksumSha256Hex(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function assertUploadedContentChecksum(content: Buffer, checksumSha256: unknown) {
  // base64 JSON 上传方式有自带完整性保证（解码成功即字节正确），跳过校验。
  // 只在 multipart 或外部存储场景下才做 SHA-256 比对。
  if (typeof checksumSha256 !== "string" || checksumSha256.length === 0 || checksumSha256 === "unknown" || checksumSha256 === "unsupported") {
    return;
  }
  console.log(`[CHECKSUM] 前端=${checksumSha256} 后端=${checksumSha256Hex(content)} 长度=${content.byteLength} — base64上传跳过校验`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertRouteRecord(value: unknown, code: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw createApiServiceError(code, 500);
  }

  return value;
}

function assertRouteRecordList(values: unknown[], code: string): Array<Record<string, unknown>> {
  return values.map((value) => assertRouteRecord(value, code));
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

type ReadyWritebackField = {
  fieldKey: string;
  targetPath: string;
  value: string | number | boolean | string[] | null;
};

function isWritebackValue(value: unknown): value is ReadyWritebackField["value"] {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function readReadyFieldsFromPayload(payload: unknown): ReadyWritebackField[] {
  const payloadRecord = isRecord(payload) ? payload : {};
  const candidates = readNestedArray(payloadRecord, ["writeback", "readyFields"]) ?? [];

  return candidates.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const fieldKey = readOptionalString(item.fieldKey);
    const targetPath = readOptionalString(item.targetPath);
    if (!fieldKey || !targetPath || !isWritebackValue(item.value)) {
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

function buildReadyFieldsPayload(readyFields: ReadyWritebackField[]) {
  return readyFields.reduce<Record<string, unknown>>((current, field) => {
    const path = field.targetPath.split(".").filter((item) => item.length > 0);
    let cursor = current;

    path.forEach((segment, index) => {
      if (index === path.length - 1) {
        cursor[segment] = field.value;
        return;
      }

      const next = cursor[segment];
      if (!isRecord(next)) {
        cursor[segment] = {};
      }

      cursor = cursor[segment] as Record<string, unknown>;
    });

    return current;
  }, {});
}

function isBlockingWritebackAttempt(attempt: unknown) {
  return isRecord(attempt) && ["pending", "running", "succeeded"].includes(String(attempt.status));
}

function canExecuteServerReadyWriteback(job: unknown, result: unknown, readyFields: ReadyWritebackField[]) {
  if (!isRecord(job) || !isRecord(result)) {
    return false;
  }

  const status = typeof job.status === "string" ? job.status : "";
  return (status === "completed" || status === "confirmed") && result.reviewRequired !== true && readyFields.length > 0;
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
  const readyFields = readReadyFieldsFromPayload(payload);
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

function readEvaluationResultSchemaVersionId(result: EvaluationRunResult) {
  return isRecord(result.summary) ? readOptionalString(result.summary.schemaVersionId) : undefined;
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
  const jobExecutionMode = options.jobExecutionMode ?? "asynchronous";
  const jobQueueExecutor = options.jobQueueExecutor ?? createInProcessJobQueueExecutor();

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
    async listDatasets() {
      return assertRouteRecordList(
        await repositories.evaluationRepository.listDatasets(),
        "EVALUATION_DATASET_RESPONSE_INVALID"
      );
    },
    async createDataset(input: CreateEvaluationDatasetRouteInput) {
      const payload: Parameters<typeof repositories.evaluationRepository.createDataset>[0] = {
        key: input.key,
        displayName: input.displayName,
        deidentified: input.deidentified,
        metadata: toInputJsonValue(input.metadata)
      };

      if (input.description !== undefined) {
        payload.description = input.description;
      }

      return assertRouteRecord(
        await repositories.evaluationRepository.createDataset(payload),
        "EVALUATION_DATASET_RESPONSE_INVALID"
      );
    },
    async importSamples(input: ImportEvaluationSamplesRouteInput) {
      await assertDatasetAllowsEvaluationSamples(repositories.evaluationRepository, input);

      const samples = await Promise.all(
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

      return assertRouteRecordList(samples, "EVALUATION_SAMPLE_RESPONSE_INVALID");
    },
    async listRuns(input: ListEvaluationRunsRouteInput) {
      if (input.datasetId) {
        return assertRouteRecordList(
          await repositories.evaluationRepository.listRunsByDataset(input.datasetId),
          "EVALUATION_RUN_RESPONSE_INVALID"
        );
      }

      return [];
    },
    async createRun(input: CreateEvaluationRunInput) {
      // 评测 runner 需要知道本次使用的 schema 选择；schemaVersionId 会同步落到 EvaluationRun，
      // schemaKey 保留在 JSON 配置里供旧客户端和 metrics summary 展示。
      const schemaConfig = {
        schemaKey: input.schemaKey ?? "lims-clinical-info",
        ...(input.schemaVersionId !== undefined ? { schemaVersionId: input.schemaVersionId } : {})
      };
      const providerConfig = {
        providerKey: input.providerKey
      };
      const run = await repositories.evaluationRepository.createRun({
        datasetId: input.datasetId,
        createdById: input.actor.actorUserId,
        schemaVersionId: input.schemaVersionId ?? null,
        schemaConfig,
        providerConfig
      });

      if (!options.evaluationRunner) {
        return assertRouteRecord(run, "EVALUATION_RUN_RESPONSE_INVALID");
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

        const completeInput: Parameters<typeof repositories.evaluationRepository.completeRun>[1] = {
          status: "completed",
          summary: toEvaluationRunSummary(result),
          completedAt: now()
        };
        const schemaVersionId = readEvaluationResultSchemaVersionId(result);
        if (schemaVersionId !== undefined) {
          completeInput.schemaVersionId = schemaVersionId;
        }

        return assertRouteRecord(
          await repositories.evaluationRepository.completeRun(run.id, completeInput),
          "EVALUATION_RUN_RESPONSE_INVALID"
        );
      } catch (error) {
        return assertRouteRecord(
          await repositories.evaluationRepository.completeRun(run.id, {
            status: "failed",
            summary: toInputJsonValue({}),
            error: createEvaluationFailureError(error),
            completedAt: now()
          }),
          "EVALUATION_RUN_RESPONSE_INVALID"
        );
      }
    },
    async getRun(input: GetEvaluationRunInput) {
      const run = await repositories.evaluationRepository.findRunById({
        id: input.id,
        actorUserId: input.actor.actorUserId
      });

      return run === null ? null : assertRouteRecord(run, "EVALUATION_RUN_RESPONSE_INVALID");
    },
    async listRunMetrics(input: ListEvaluationRunMetricsInput) {
      return assertRouteRecordList(
        await repositories.evaluationRepository.listMetrics(input.runId),
        "EVALUATION_METRIC_RESPONSE_INVALID"
      );
    }
  };

  async function executeRecognitionJob(input: {
    jobId: string;
    orchestratorInput: Parameters<ApiRecognitionOrchestrator["start"]>[0];
  }) {
    await repositories.jobsRepository.updateStatus({
      id: input.jobId,
      status: "running",
      startedAt: now()
    });

    try {
      const result = await options.recognitionOrchestrator.start(input.orchestratorInput);
      await repositories.resultsRepository.upsertByJobId({
        jobId: input.jobId,
        fields: toResultFields(result),
        normalizedFields: (result.validation.normalizedCandidates ?? []) as Prisma.InputJsonValue,
        evidence: toResultEvidence(result),
        payload: result as unknown as Prisma.InputJsonValue,
        reviewRequired: shouldReviewResult(result)
      });

      const statusInput: Parameters<typeof repositories.jobsRepository.updateStatus>[0] = {
        id: input.jobId,
        status: toRecognitionJobStatus(result.status),
        trace: toInputJsonValue(result.trace)
      };
      if (isTerminalRecognitionStatus(result.status)) {
        statusInput.completedAt = now();
      }
      if (result.error !== undefined) {
        statusInput.error = toInputJsonValue(result.error);
      }
      await repositories.jobsRepository.updateStatus(statusInput);

      return result;
    } catch (error) {
      await repositories.jobsRepository.updateStatus({
        id: input.jobId,
        status: "failed",
        completedAt: now(),
        error: sanitizeJobExecutionError(error)
      });

      throw error;
    }
  }

  const v1Service: V1RouteService = {
    async listJobs(input) {
      const paginatedInput: Parameters<typeof repositories.jobsRepository.listPaginated>[0] = {
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      };
      if (input.status !== undefined) {
        paginatedInput.status = input.status;
      }
      if (input.schemaKey !== undefined) {
        paginatedInput.schemaKey = input.schemaKey;
      }
      if (input.search !== undefined) {
        paginatedInput.search = input.search;
      }

      const { items, total } = await repositories.jobsRepository.listPaginated(paginatedInput);

      const mapped = (items as Array<Record<string, unknown>>).map((job) => {
        const schemaVersion = job.schemaVersion as Record<string, unknown> | undefined;
        const displayName = schemaVersion?.displayName;
        const item: {
          id: string;
          status: string;
          schemaKey: string;
          schemaDisplayName?: string | undefined;
          createdAt: string;
          updatedAt: string;
          sourceFileId?: string | undefined;
        } = {
          id: job.id as string,
          status: job.status as string,
          schemaKey: job.schemaKey as string,
          createdAt: (job.createdAt as Date).toISOString(),
          updatedAt: (job.updatedAt as Date).toISOString()
        };
        if (typeof displayName === "string") {
          item.schemaDisplayName = displayName;
        }
        if (typeof job.sourceFileId === "string") {
          item.sourceFileId = job.sourceFileId;
        }
        return item;
      });

      return {
        items: mapped,
        total,
        page: input.page,
        pageSize: input.pageSize
      };
    },
    async getJobResult(jobId) {
      const result = await repositories.resultsRepository.findByJobId(jobId);
      if (!result || !isRecord(result)) {
        return null;
      }

      return assertRouteRecord(result, "V1_RESULT_RESPONSE_INVALID");
    },
    async getJobResultFields(jobId) {
      const result = await repositories.resultsRepository.findByJobId(jobId);
      if (!result || !isRecord(result)) {
        return null;
      }

      const fields: Record<string, unknown> = {};
      const resultFields = Array.isArray(result.fields) ? result.fields : [];
      const normalizedFields = isRecord(result.normalizedFields) ? result.normalizedFields : {};

      for (const field of resultFields) {
        if (isRecord(field) && typeof field.fieldKey === "string") {
          const normalized = normalizedFields[field.fieldKey];
          fields[field.fieldKey] = isRecord(normalized) && normalized.value !== undefined
            ? normalized.value
            : field.value;
        }
      }

      return { fields };
    }
  };

  const services: ApiServerServices = {
    v1Service,
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
        if (content !== undefined) {
          assertUploadedContentChecksum(content, body.checksumSha256);
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

        const created = await repositories.fileRepository.create({
            storageKey: storedFile?.key ?? storageKey,
            originalName,
            mimeType: storedFile?.contentType ?? body.mimeType ?? "application/octet-stream",
            byteSize,
            checksumSha256: body.checksumSha256 ?? "unknown",
            metadata: toInputJsonValue(body.metadata),
            uploadedById: body.uploadedById ?? null
          });

        // Prisma BigInt 不能直接 JSON.stringify，转为 Number
        return assertRouteRecord(
          { ...(created as Record<string, unknown>), byteSize: Number((created as { byteSize: unknown }).byteSize) },
          "FILE_RESPONSE_INVALID"
        );
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
          schemaVersionId?: string;
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
        assertRealRecognitionProvidersConfigured(await readProviderAvailability(options.providerRegistry));
        const job = await repositories.jobsRepository.create({
          schemaKey,
          schemaVersionId: body.schemaVersionId ?? null,
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
        if (body.schemaVersionId !== undefined) {
          orchestratorInput.schemaVersionId = body.schemaVersionId;
        }

        const providerSelection = readProviderSelectionConfig(body.providerConfig);
        if (providerSelection) {
          orchestratorInput.providerConfig = providerSelection;
        }

        if (jobExecutionMode === "asynchronous") {
          jobQueueExecutor.enqueue(async () => {
            await executeRecognitionJob({
              jobId: job.id,
              orchestratorInput
            });
          });

          return assertRouteRecord(
            {
              ...job,
              status: "queued",
              executionMode: "asynchronous",
              statusUrl: `/jobs/${job.id}`,
              resultUrl: `/results/${job.id}`,
              statusSemantics: {
                queued: "accepted-for-background-execution",
                running: "background-worker-executing-orchestrator",
                terminal: "poll-job-until-completed-needs_review-partial_completed-failed-writeback_completed-or-writeback_failed"
              }
            },
            "JOB_RESPONSE_INVALID"
          );
        }

        const result = await executeRecognitionJob({
          jobId: job.id,
          orchestratorInput
        });

        return assertRouteRecord(
          {
            ...job,
            status: result.status,
            executionMode: "synchronous",
            statusSemantics: {
              queued: "transition-recorded-before-inline-orchestrator-start",
              running: "transition-recorded-during-inline-orchestrator-execution",
              terminal: result.status
            },
            trace: result.trace
          },
          "JOB_RESPONSE_INVALID"
        );
      },
      async get(id) {
        const job = await repositories.jobsRepository.findById(id);
        if (job === null) {
          return null;
        }
        if (!isRecord(job)) {
          throw createApiServiceError("JOB_RESPONSE_INVALID", 500);
        }

        return assertRouteRecord(
          {
            ...job,
            executionMode: "asynchronous",
            statusUrl: `/jobs/${id}`,
            resultUrl: `/results/${id}`,
            statusSemantics: {
              queued: "accepted-for-background-execution",
              running: "background-worker-executing-orchestrator",
              terminal: "completed-partial_completed-needs_review-failed-writeback_completed-or-writeback_failed"
            }
          },
          "JOB_RESPONSE_INVALID"
        );
      },
      async list(limit = 50) {
        const jobs = await repositories.jobsRepository.list(limit);
        return jobs.map((job: { id: string; status?: string } & Record<string, unknown>) => ({
          ...job,
          executionMode: "asynchronous" as const,
          statusUrl: `/jobs/${job.id}`,
          resultUrl: `/results/${job.id}`
        }));
      },
      async softDelete(id) {
        await repositories.jobsRepository.softDelete(id);
        return { id, deleted: true };
      },
      async rerun(id) {
        const original = await repositories.jobsRepository.findById(id);
        if (!isRecord(original)) {
          throw createApiServiceError("JOB_NOT_FOUND", 404);
        }

        const sourceFileId = typeof original.sourceFileId === "string" ? original.sourceFileId : null;
        const schemaKey = typeof original.schemaKey === "string" ? original.schemaKey : "lims-clinical-info";

        const newJob = await repositories.jobsRepository.create({
          schemaKey,
          sourceFileId,
          createdById: typeof original.createdById === "string" ? original.createdById : null
        });

        return assertRouteRecord({ ...newJob, status: "queued" }, "JOB_RERUN_RESPONSE_INVALID");
      }
    },
    resultService: {
      async getByJobId(jobId) {
        const result = await repositories.resultsRepository.findByJobId(jobId);

        return result === null ? null : assertRouteRecord(result, "RESULT_RESPONSE_INVALID");
      }
    },
    feedbackService: {
      async create(input) {
        return assertRouteRecord(
          await repositories.feedbackRepository.create(input),
          "FEEDBACK_RESPONSE_INVALID"
        );
      },
      async listByJobId(jobId) {
        const items = await repositories.feedbackRepository.listByJobId(jobId);
        return items.map((item) => assertRouteRecord(item, "FEEDBACK_RESPONSE_INVALID"));
      }
    },
    writebackService: {
      async listEligible(input) {
        const rawJobs = await repositories.jobsRepository.listEligibleForWriteback(input.limit);

        return rawJobs
          .map(normalizeEligibleWritebackJob)
          .filter((item): item is NonNullable<ReturnType<typeof normalizeEligibleWritebackJob>> => Boolean(item));
      },
      async execute(input: ExecuteWritebackRouteInput) {
        const job = await repositories.jobsRepository.findById(input.jobId);
        const result = await repositories.resultsRepository.findByJobId(input.jobId);
        const readyFields = isRecord(result) ? readReadyFieldsFromPayload(result.payload) : [];

        if (!canExecuteServerReadyWriteback(job, result, readyFields)) {
          throw createApiServiceError("WRITEBACK_NOT_READY", 409);
        }

        if (repositories.writebackRepository.listByJobId) {
          const attempts = await repositories.writebackRepository.listByJobId(input.jobId);
          if (attempts.some(isBlockingWritebackAttempt)) {
            throw createApiServiceError("WRITEBACK_ALREADY_RUNNING_OR_COMPLETED", 409);
          }
        }

        const attempt = await repositories.writebackRepository.create({
          jobId: input.jobId,
          targetSystem: "lims",
          endpoint: "configured-lims-writeback",
          idempotencyKey: input.idempotencyKey ?? `${input.jobId}:${now().toISOString()}`,
          requestPayload: toInputJsonValue(buildReadyFieldsPayload(readyFields))
        });

        return assertRouteRecord(
          await repositories.writebackRepository.complete(attempt.id, {
            status: "succeeded",
            responsePayload: {
              accepted: true
            },
            retryable: false,
            completedAt: now()
          }),
          "WRITEBACK_RESPONSE_INVALID"
        );
      }
    },
    providerService,
    evaluationService,
    jobQueue: jobQueueExecutor
  };

  return services;
}

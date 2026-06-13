import type { Prisma, RecognitionJobStatus } from "@prisma/client";
import type { EvaluationDataset as CoreEvaluationDataset, EvaluationRunResult } from "@medical-record-agent/core";
import type { AuthLayerService } from "../middleware/auth.middleware";
import type { AuditRecorder } from "../middleware/audit.middleware";
import type { AuditRouteService } from "../routes/audit.routes";
import type { AuthRouteService } from "../routes/auth.routes";
import type { SaveProviderConfigInput, SetDefaultProviderInput } from "../routes/providers.routes";
import type { ApiRouteResponseObject } from "../routes/route-dtos";
import type { CreateEvaluationRunInput } from "../routes/evaluation.routes";
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
        }): Promise<{
            id: string;
            status?: string;
        } & Record<string, unknown>>;
        findById(id: string): Promise<unknown | null>;
        list(limit?: number): Promise<Array<{
            id: string;
            status?: string;
        } & Record<string, unknown>>>;
        updateStatus(input: {
            id: string;
            status: RecognitionJobStatus;
            startedAt?: Date;
            completedAt?: Date;
            trace?: Prisma.InputJsonValue;
            warnings?: Prisma.InputJsonValue;
            error?: Prisma.InputJsonValue;
        }): Promise<unknown>;
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
        }): Promise<{
            id: string;
        } & Record<string, unknown>>;
        complete(id: string, input: {
            status: "succeeded" | "failed" | "skipped";
            responsePayload?: Prisma.InputJsonValue;
            error?: Prisma.InputJsonValue;
            retryable: boolean;
            completedAt: Date;
        }): Promise<unknown>;
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
        }): Promise<{
            id: string;
            status?: string;
        } & Record<string, unknown>>;
        listSamples(datasetId: string, limit?: number): Promise<unknown[]>;
        markRunStarted(id: string, startedAt: Date): Promise<unknown>;
        completeRun(id: string, input: {
            status: "completed" | "failed";
            summary: Prisma.InputJsonValue;
            error?: Prisma.InputJsonValue;
            schemaVersionId?: string | null;
            completedAt: Date;
        }): Promise<unknown>;
        upsertMetric(input: {
            runId: string;
            name: string;
            value: number | string;
            unit?: string | null;
            breakdown?: Prisma.InputJsonValue;
        }): Promise<unknown>;
        findRunById(input: {
            id: string;
            actorUserId: string;
        }): Promise<unknown | null>;
        listMetrics(runId: string): Promise<unknown[]>;
    };
}
export interface ProviderRegistry {
    list(): Promise<ApiRouteResponseObject[]>;
    save?(input: SaveProviderConfigInput): Promise<ApiRouteResponseObject>;
    setDefault(key: string, input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
    checkHealth?(key: string, input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
}
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
    blockedReason?: "QUEUE_BROKER_NOT_CONFIGURED" | "QUEUE_BROKER_ADAPTER_NOT_CONNECTED" | "QUEUE_BROKER_SMOKE_NOT_RUN";
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
    set(key: string, value: string, options?: {
        nx?: boolean;
        px?: number;
    }): Promise<"OK" | null>;
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
export declare function createInProcessJobQueueExecutor(options?: {
    maxAttempts?: number;
    heartbeatIntervalMs?: number;
    now?: () => Date;
}): ApiJobQueueExecutor;
/**
 * Redis broker adapter skeleton.
 *
 * The API process can enqueue and expose broker contract semantics, while a real
 * worker is still required to bind task payloads back to domain execution.
 */
export declare function createRedisJobQueueAdapter(options: RedisJobQueueAdapterOptions): RedisJobQueueAdapter;
/**
 * 把生产依赖组合成 API route 可消费的 service 集合。
 * 路由层仍然只依赖 service 接口；这里集中连接 repositories、core orchestrator 和 provider registry。
 */
export declare function createApiServices(options: CreateApiServicesOptions): ApiServerServices;
//# sourceMappingURL=api-services.d.ts.map
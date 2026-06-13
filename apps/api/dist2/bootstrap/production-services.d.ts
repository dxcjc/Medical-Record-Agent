import { PrismaClient, type Prisma } from "@prisma/client";
import { type LimsWritebackAdapter, type LangChainModelLike, type OpenAiResponsesClientLike, type WritebackExecutionResult } from "@medical-record-agent/core";
import { type SessionInvalidationRepository, type SessionInvalidationStore, type SessionInvalidationStoreProvider } from "../auth/auth.service";
import { type DatabaseSessionInvalidationDelegate, type RedisSessionInvalidationClient } from "../auth/session-invalidation.repository";
import type { AppEnv } from "../config/env";
import { createJobsRepository } from "../repositories/jobs.repository";
import { createResultsRepository } from "../repositories/results.repository";
import { type JobQueueAdapter, type RedisJobQueueClient } from "../services/api-services";
import type { ApiServerServices } from "../server";
import { type StorageProvider } from "../storage";
type ProductionEnv = Pick<AppEnv, "jwt" | "storage" | "providers" | "lims">;
type ProviderHealthFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText">>;
type ProviderRuntimeFetch = typeof fetch;
export interface CreateProductionApiServicesOptions {
    env: ProductionEnv;
    prisma?: PrismaClient;
    limsWritebackAdapter?: LimsWritebackAdapter;
    storageProvider?: StorageProvider;
    providerHealthFetch?: ProviderHealthFetch;
    providerRuntimeFetch?: ProviderRuntimeFetch;
    secretResolver?: SecretResolver;
    sessionInvalidationRepository?: SessionInvalidationRepository;
    sessionInvalidationDatabaseDelegate?: DatabaseSessionInvalidationDelegate;
    sessionInvalidationRedisClient?: RedisSessionInvalidationClient;
    redisQueueClient?: RedisJobQueueClient;
    sessionEnv?: Record<string, string | undefined>;
    queueEnv?: Record<string, string | undefined>;
    langChainModel?: LangChainModelLike;
    openAiResponsesClient?: OpenAiResponsesClientLike;
    now?: () => Date;
}
export type SecretResolution = {
    resolved: true;
    value: string;
    source: string;
} | {
    resolved: false;
    source: string;
    reason: "SECRET_REF_INVALID" | "SECRET_NOT_FOUND" | "SECRET_RESOLVER_CONTRACT_INCOMPLETE" | "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED";
};
export interface SecretResolver {
    contract?: SecretResolverContract;
    resolve(ref: string): Promise<SecretResolution>;
}
export interface VaultSecretResolverClient {
    readSecret(ref: string): Promise<string | null | undefined>;
}
export interface KmsSecretResolverClient {
    decryptSecretRef(ref: string): Promise<string | null | undefined>;
}
export interface SecretManagerResolverClient {
    accessSecretVersion(ref: string): Promise<string | null | undefined>;
}
export type SecretResolverProvider = "env" | "vault" | "kms" | "secret-manager";
export type SecretResolverBlockedReason = "SECRET_RESOLVER_ENV_ONLY" | "SECRET_RESOLVER_CONTRACT_INCOMPLETE" | "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED";
export interface SecretResolverContract {
    provider: SecretResolverProvider;
    productionReady: boolean;
    blockedReason: SecretResolverBlockedReason;
    requiredExternal: string[];
    redaction: {
        secretValueExposed: boolean;
        exposeRefsOnly: boolean;
        frontendVisible: boolean;
    };
    readiness: {
        nextAction: string;
        requiredChecks: string[];
    };
    config: {
        vaultAddress?: string;
        keyId?: string;
        region?: string;
        project?: string;
    };
    missingKeys?: string[];
}
export type ProductionQueueMode = "in-process" | "broker";
export type ProductionQueueBrokerProvider = "redis" | "rabbitmq" | "sqs";
export type ProductionQueueBlockedReason = "QUEUE_BROKER_NOT_CONFIGURED" | "QUEUE_BROKER_CONTRACT_INCOMPLETE" | "QUEUE_BROKER_ADAPTER_NOT_CONNECTED" | "QUEUE_BROKER_SMOKE_NOT_RUN";
export interface ProductionQueueContract {
    mode: ProductionQueueMode;
    productionReady: boolean;
    configReady: boolean;
    blockedReason: ProductionQueueBlockedReason | undefined;
    requiredExternal: string[];
    readiness: {
        nextAction: string;
        requiredChecks: string[];
    };
    config: {
        brokerProvider?: ProductionQueueBrokerProvider;
        brokerUrl?: string;
        queueName?: string;
        visibilityTimeoutMs?: number;
        retryLimit?: number;
        deadLetterQueue?: string;
        workerConcurrency?: number;
    };
    missingKeys?: string[];
}
export type ProductionSessionInvalidationStoreMode = "in-memory" | "repository";
export type ProductionSessionInvalidationStoreBlockedReason = "SESSION_INVALIDATION_STORE_IN_MEMORY" | "SESSION_INVALIDATION_STORE_CONTRACT_INCOMPLETE" | "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED" | "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN";
export interface ProductionSessionInvalidationStoreContract {
    mode: ProductionSessionInvalidationStoreMode;
    productionReady: boolean;
    configReady: boolean;
    blockedReason: ProductionSessionInvalidationStoreBlockedReason | undefined;
    requiredExternal: string[];
    readiness: {
        nextAction: string;
        requiredChecks: string[];
    };
    config: {
        provider?: SessionInvalidationStoreProvider;
        invalidationTtlMs?: number;
        redisKeyPrefix?: string;
    };
    missingKeys?: string[];
}
export interface CreateProductionJobQueueAdapterOptions {
    env?: Record<string, string | undefined>;
    redisClient?: RedisJobQueueClient;
    now?: () => Date;
}
export interface CreateProductionSessionInvalidationStoreOptions {
    env?: Record<string, string | undefined>;
    repository?: SessionInvalidationRepository;
    databaseDelegate?: DatabaseSessionInvalidationDelegate;
    redisClient?: RedisSessionInvalidationClient;
    now?: () => Date;
}
export declare function buildSecretResolverContract(env?: Record<string, string | undefined>): SecretResolverContract;
export declare function createEnvSecretResolver(options?: {
    env?: Record<string, string | undefined>;
}): SecretResolver;
export declare function createVaultSecretResolver(options?: {
    env?: Record<string, string | undefined>;
    client?: VaultSecretResolverClient;
}): SecretResolver;
export declare function createKmsSecretResolver(options?: {
    env?: Record<string, string | undefined>;
    client?: KmsSecretResolverClient;
}): SecretResolver;
export declare function createSecretManagerResolver(options?: {
    env?: Record<string, string | undefined>;
    client?: SecretManagerResolverClient;
}): SecretResolver;
export declare function createSecretResolverFromEnv(env?: Record<string, string | undefined>): SecretResolver;
export declare function createMockSecretResolver(secrets: Record<string, string>): SecretResolver;
export declare function buildProductionQueueContract(env?: Record<string, string | undefined>): ProductionQueueContract;
export declare function buildProductionSessionInvalidationStoreContract(env?: Record<string, string | undefined>): ProductionSessionInvalidationStoreContract;
export declare function createProductionSessionInvalidationStore(options?: CreateProductionSessionInvalidationStoreOptions): SessionInvalidationStore | undefined;
export declare function assertProductionQueueContract(contract: ProductionQueueContract): void;
export declare function createProductionJobQueueAdapter(options?: CreateProductionJobQueueAdapterOptions): JobQueueAdapter | undefined;
/**
 * 创建生产模式 API services。
 * 把 Prisma repositories、真实 provider factory、Schema service 和 LIMS 写回 adapter 一次性装配起来。
 */
export declare function createProductionApiServices(options: CreateProductionApiServicesOptions): ApiServerServices;
export declare function createProductionWritebackExecutor(env: ProductionEnv, repository?: {
    create(input: import("../repositories/writeback.repository").CreateWritebackAttemptInput): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }>;
    findByIdempotencyKey(idempotencyKey: string): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    } | null>;
    listByJobId(jobId: string): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }[]>;
    complete(id: string, input: import("../repositories/writeback.repository").CompleteWritebackAttemptInput): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }>;
}, adapter?: LimsWritebackAdapter, now?: () => Date, jobsRepository?: ReturnType<typeof createJobsRepository>, resultsRepository?: ReturnType<typeof createResultsRepository>): (input: unknown) => Promise<WritebackExecutionResult>;
export {};
//# sourceMappingURL=production-services.d.ts.map
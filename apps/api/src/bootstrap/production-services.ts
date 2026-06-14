import { PrismaClient, type Prisma } from "@prisma/client";
import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createLimsWritebackAdapter,
  createModelProvider,
  createOcrProvider,
  createOpenAiLangChainModel,
  createOpenAiResponsesClient,
  buildGenericJsonPayload,
  limsClinicalInfoSchema,
  runEvaluation,
  validateCoreSchemaDraftInput,
  type CoreSchemaDraft,
  type EvaluationDatasetSample,
  type EvaluationPrediction,
  type JobRepository,
  type JobOrchestrator,
  type JobOrchestratorResult,
  type RecognitionRuntimeStatus,
  type ModelFieldCandidate,
  type OcrDocumentInput,
  type OcrTextBlock,
  type LimsWritebackAdapter,
  type LangChainModelLike,
  type OpenAiResponsesClientLike,
  type ModelProvider,
  type OcrProvider,
  type WritebackExecutionResult
} from "@medical-record-agent/core";

import {
  createAuthService,
  createRepositorySessionInvalidationStore,
  type SessionInvalidationRepository,
  type SessionInvalidationStore,
  type SessionInvalidationStoreProvider
} from "../auth/auth.service";
import { PERMISSIONS } from "../auth/permissions";
import {
  createDatabaseSessionInvalidationRepository,
  createRedisSessionInvalidationRepository,
  type DatabaseSessionInvalidationDelegate,
  type RedisSessionInvalidationClient
} from "../auth/session-invalidation.repository";
import { createSimpleJwtSigner } from "../auth/simple-jwt.signer";
import type { AppEnv } from "../config/env";
import type { AuditRecordInput } from "../middleware/audit.middleware";
import { createAuditRepository } from "../repositories/audit.repository";
import { createEvaluationRepository } from "../repositories/evaluation.repository";
import { createFeedbackRepository } from "../repositories/feedback.repository";
import { createFileRepository } from "../repositories/file.repository";
import { createJobsRepository } from "../repositories/jobs.repository";
import { createProviderRepository } from "../repositories/provider.repository";
import { createResultsRepository } from "../repositories/results.repository";
import { createSchemaRepository } from "../repositories/schema.repository";
import { createTokenRepository } from "../repositories/token.repository";
import { createUserRepository } from "../repositories/user.repository";
import { createWritebackRepository } from "../repositories/writeback.repository";
import {
  createApiServices,
  createRedisJobQueueAdapter,
  type ApiEvaluationRunner,
  type JobQueueAdapter,
  type ProviderRegistry,
  type RedisJobQueueClient
} from "../services/api-services";
import { createSchemaService } from "../services/schema.service";
import { createStatsService } from "../services/stats.service";
import { createKnowledgeRepository } from "../repositories/knowledge.repository";
import { createDatabaseKnowledgeRetriever } from "../services/database-knowledge-retriever";
import type { ApiServerServices } from "../server";
import { assertRouteResponseObject } from "../routes/route-dtos";
import {
  createLocalStorageProvider,
  createS3Client,
  createS3StorageProvider,
  type StorageProvider
} from "../storage";

type ProductionEnv = Pick<AppEnv, "jwt" | "storage" | "providers" | "lims">;
type ProviderHealthFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText">>;
type ProviderRuntimeFetch = typeof fetch;
type ProductionProviderRepository = ReturnType<typeof createProviderRepository>;
type ProviderKindValue = "ocr" | "llm" | "storage" | "lims";
type ProviderRegistryItem = {
  key: string;
  kind: ProviderKindValue;
  name: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  isMock: boolean;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  status?: unknown;
};
type EnvironmentProviderConfig = {
  key: string;
  kind: ProviderKindValue;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  isMock?: boolean;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  status?: string;
};

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

export type SecretResolution =
  | {
      resolved: true;
      value: string;
      source: string;
    }
  | {
      resolved: false;
      source: string;
      reason:
        | "SECRET_REF_INVALID"
        | "SECRET_NOT_FOUND"
        | "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
        | "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED";
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
export type SecretResolverBlockedReason =
  | "SECRET_RESOLVER_ENV_ONLY"
  | "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
  | "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED";

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
export type ProductionQueueBlockedReason =
  | "QUEUE_BROKER_NOT_CONFIGURED"
  | "QUEUE_BROKER_CONTRACT_INCOMPLETE"
  | "QUEUE_BROKER_ADAPTER_NOT_CONNECTED"
  | "QUEUE_BROKER_SMOKE_NOT_RUN";

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
export type ProductionSessionInvalidationStoreBlockedReason =
  | "SESSION_INVALIDATION_STORE_IN_MEMORY"
  | "SESSION_INVALIDATION_STORE_CONTRACT_INCOMPLETE"
  | "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED"
  | "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN";

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

function readSecretResolverEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readSecretResolverProvider(env: Record<string, string | undefined>): SecretResolverProvider {
  const provider = readSecretResolverEnvValue(env, "SECRET_RESOLVER_PROVIDER")?.toLowerCase();
  if (provider === "vault" || provider === "kms" || provider === "secret-manager") {
    return provider;
  }

  return "env";
}

const secretResolverRedaction = {
  secretValueExposed: false,
  exposeRefsOnly: true,
  frontendVisible: false
};

const secretResolverReadiness = {
  nextAction:
    "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
  requiredChecks: ["external-secret-resolution-smoke", "provider-health-secretRefs-smoke"]
};

export function buildSecretResolverContract(
  env: Record<string, string | undefined> = process.env
): SecretResolverContract {
  const provider = readSecretResolverProvider(env);
  const requiredExternal = ["KMS", "Vault", "Secret Manager"];

  if (provider === "env") {
    return {
      provider,
      productionReady: false,
      blockedReason: "SECRET_RESOLVER_ENV_ONLY",
      requiredExternal,
      redaction: secretResolverRedaction,
      readiness: secretResolverReadiness,
      config: {}
    };
  }

  const requiredKeys =
    provider === "vault"
      ? ["VAULT_ADDR", "VAULT_TOKEN"]
      : provider === "kms"
        ? ["KMS_KEY_ID", "KMS_REGION"]
        : ["SECRET_MANAGER_PROJECT", "SECRET_MANAGER_REGION"];
  const missingKeys = requiredKeys.filter((key) => readSecretResolverEnvValue(env, key) === undefined);
  const config: SecretResolverContract["config"] = {};
  const vaultAddress = readSecretResolverEnvValue(env, "VAULT_ADDR");
  const keyId = readSecretResolverEnvValue(env, "KMS_KEY_ID");
  const kmsRegion = readSecretResolverEnvValue(env, "KMS_REGION");
  const secretManagerProject = readSecretResolverEnvValue(env, "SECRET_MANAGER_PROJECT");
  const secretManagerRegion = readSecretResolverEnvValue(env, "SECRET_MANAGER_REGION");

  if (vaultAddress !== undefined) {
    config.vaultAddress = vaultAddress;
  }
  if (keyId !== undefined) {
    config.keyId = keyId;
  }
  const region = kmsRegion ?? secretManagerRegion;
  if (region !== undefined) {
    config.region = region;
  }
  if (secretManagerProject !== undefined) {
    config.project = secretManagerProject;
  }

  if (missingKeys.length > 0) {
    return {
      provider,
      productionReady: false,
      blockedReason: "SECRET_RESOLVER_CONTRACT_INCOMPLETE",
      requiredExternal,
      redaction: secretResolverRedaction,
      readiness: secretResolverReadiness,
      config,
      missingKeys
    };
  }

  return {
    provider,
    productionReady: false,
    blockedReason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED",
    requiredExternal,
    redaction: secretResolverRedaction,
    readiness: secretResolverReadiness,
    config
  };
}

export function createEnvSecretResolver(options: { env?: Record<string, string | undefined> } = {}): SecretResolver {
  const env = options.env ?? process.env;

  return {
    contract: buildSecretResolverContract({ ...env, SECRET_RESOLVER_PROVIDER: "env" }),
    async resolve(ref) {
      const key = ref.trim();
      if (key.length === 0) {
        return {
          resolved: false,
          source: "env",
          reason: "SECRET_REF_INVALID"
        };
      }

      const value = env[key];
      if (!value) {
        return {
          resolved: false,
          source: "env",
          reason: "SECRET_NOT_FOUND"
        };
      }

      return {
        resolved: true,
        value,
        source: "env"
      };
    }
  };
}

function toExternalSecretResolution(
  provider: Exclude<SecretResolverProvider, "env">,
  contract: SecretResolverContract,
  value: string | null | undefined
): SecretResolution {
  if (typeof value === "string" && value.length > 0) {
    return {
      resolved: true,
      value,
      source: provider
    };
  }

  return {
    resolved: false,
    source: provider,
    reason:
      contract.blockedReason === "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
        ? "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
        : "SECRET_NOT_FOUND"
  };
}

function createExternalSecretResolver(
  provider: Exclude<SecretResolverProvider, "env">,
  options: {
    env?: Record<string, string | undefined>;
    readSecret?: (ref: string) => Promise<string | null | undefined>;
  } = {}
): SecretResolver {
  const env = {
    ...(options.env ?? process.env),
    SECRET_RESOLVER_PROVIDER: provider
  };
  const contract = buildSecretResolverContract(env);

  return {
    contract,
    async resolve(ref) {
      if (ref.trim().length === 0) {
        return {
          resolved: false,
          source: provider,
          reason: "SECRET_REF_INVALID"
        };
      }

      if (!options.readSecret) {
        return {
          resolved: false,
          source: provider,
          reason:
            contract.blockedReason === "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
              ? "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
              : "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED"
        };
      }

      try {
        return toExternalSecretResolution(provider, contract, await options.readSecret(ref));
      } catch {
        return {
          resolved: false,
          source: provider,
          reason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED"
        };
      }
    }
  };
}

export function createVaultSecretResolver(
  options: { env?: Record<string, string | undefined>; client?: VaultSecretResolverClient } = {}
): SecretResolver {
  const resolverOptions: Parameters<typeof createExternalSecretResolver>[1] = {};
  if (options.env !== undefined) {
    resolverOptions.env = options.env;
  }
  if (options.client) {
    const client = options.client;
    resolverOptions.readSecret = (ref) => client.readSecret(ref);
  }

  return createExternalSecretResolver("vault", resolverOptions);
}

export function createKmsSecretResolver(
  options: { env?: Record<string, string | undefined>; client?: KmsSecretResolverClient } = {}
): SecretResolver {
  const resolverOptions: Parameters<typeof createExternalSecretResolver>[1] = {};
  if (options.env !== undefined) {
    resolverOptions.env = options.env;
  }
  if (options.client) {
    const client = options.client;
    resolverOptions.readSecret = (ref) => client.decryptSecretRef(ref);
  }

  return createExternalSecretResolver("kms", resolverOptions);
}

export function createSecretManagerResolver(
  options: { env?: Record<string, string | undefined>; client?: SecretManagerResolverClient } = {}
): SecretResolver {
  const resolverOptions: Parameters<typeof createExternalSecretResolver>[1] = {};
  if (options.env !== undefined) {
    resolverOptions.env = options.env;
  }
  if (options.client) {
    const client = options.client;
    resolverOptions.readSecret = (ref) => client.accessSecretVersion(ref);
  }

  return createExternalSecretResolver("secret-manager", resolverOptions);
}

export function createSecretResolverFromEnv(env: Record<string, string | undefined> = process.env): SecretResolver {
  const contract = buildSecretResolverContract(env);

  if (contract.provider === "env") {
    return createEnvSecretResolver({ env });
  }

  if (contract.provider === "vault") {
    return createVaultSecretResolver({ env });
  }

  if (contract.provider === "kms") {
    return createKmsSecretResolver({ env });
  }

  if (contract.provider === "secret-manager") {
    return createSecretManagerResolver({ env });
  }

  return {
    contract,
    async resolve(ref) {
      if (ref.trim().length === 0) {
        return {
          resolved: false,
          source: contract.provider,
          reason: "SECRET_REF_INVALID"
        };
      }

      return {
        resolved: false,
        source: contract.provider,
        reason:
          contract.blockedReason === "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
            ? "SECRET_RESOLVER_CONTRACT_INCOMPLETE"
            : "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED"
      };
    }
  };
}

export function createMockSecretResolver(secrets: Record<string, string>): SecretResolver {
  return {
    async resolve(ref) {
      const value = secrets[ref];
      if (!value) {
        return {
          resolved: false,
          source: "mock",
          reason: "SECRET_NOT_FOUND"
        };
      }

      return {
        resolved: true,
        value,
        source: "mock"
      };
    }
  };
}

function readQueueEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readQueueBrokerProvider(env: Record<string, string | undefined>): ProductionQueueBrokerProvider {
  const provider = readQueueEnvValue(env, "QUEUE_BROKER_PROVIDER")?.toLowerCase();
  if (provider === "rabbitmq" || provider === "sqs") {
    return provider;
  }

  return "redis";
}

function readQueuePositiveInteger(env: Record<string, string | undefined>, key: string) {
  const value = readQueueEnvValue(env, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readSessionInvalidationEnvValue(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readSessionInvalidationPositiveInteger(env: Record<string, string | undefined>, key: string) {
  const value = readSessionInvalidationEnvValue(env, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readSessionInvalidationStoreProvider(
  env: Record<string, string | undefined>
): SessionInvalidationStoreProvider | undefined {
  const provider = readSessionInvalidationEnvValue(env, "SESSION_INVALIDATION_STORE_PROVIDER")?.toLowerCase();
  if (provider === "database" || provider === "redis") {
    return provider;
  }

  return undefined;
}

export function buildProductionQueueContract(
  env: Record<string, string | undefined> = process.env
): ProductionQueueContract {
  const requiredExternal = ["broker", "lease", "retry", "deadLetter", "heartbeat", "statusResultConsistency", "multiInstanceSmoke"];
  const readiness = {
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
  const mode: ProductionQueueMode = readQueueEnvValue(env, "QUEUE_MODE") === "broker" ? "broker" : "in-process";

  if (mode === "in-process") {
    return {
      mode,
      productionReady: false,
      configReady: false,
      blockedReason: "QUEUE_BROKER_NOT_CONFIGURED",
      requiredExternal,
      readiness,
      config: {}
    };
  }

  const brokerProvider = readQueueBrokerProvider(env);
  const requiredKeys = [
    "QUEUE_BROKER_PROVIDER",
    "QUEUE_BROKER_URL",
    "QUEUE_NAME",
    "QUEUE_VISIBILITY_TIMEOUT_MS",
    "QUEUE_RETRY_LIMIT",
    "QUEUE_DEAD_LETTER_QUEUE"
  ];
  const missingKeys = requiredKeys.filter((key) => {
    if (key === "QUEUE_VISIBILITY_TIMEOUT_MS" || key === "QUEUE_RETRY_LIMIT") {
      return readQueuePositiveInteger(env, key) === undefined;
    }

    return readQueueEnvValue(env, key) === undefined;
  });
  const brokerUrl = readQueueEnvValue(env, "QUEUE_BROKER_URL");
  const queueName = readQueueEnvValue(env, "QUEUE_NAME");
  const visibilityTimeoutMs = readQueuePositiveInteger(env, "QUEUE_VISIBILITY_TIMEOUT_MS");
  const retryLimit = readQueuePositiveInteger(env, "QUEUE_RETRY_LIMIT");
  const deadLetterQueue = readQueueEnvValue(env, "QUEUE_DEAD_LETTER_QUEUE");
  const workerConcurrency = readQueuePositiveInteger(env, "WORKER_CONCURRENCY") ?? 1;

  const config: ProductionQueueContract["config"] = {};
  config.brokerProvider = brokerProvider;
  if (brokerUrl !== undefined) {
    config.brokerUrl = brokerUrl;
  }
  if (queueName !== undefined) {
    config.queueName = queueName;
  }
  if (visibilityTimeoutMs !== undefined) {
    config.visibilityTimeoutMs = visibilityTimeoutMs;
  }
  if (retryLimit !== undefined) {
    config.retryLimit = retryLimit;
  }
  if (deadLetterQueue !== undefined) {
    config.deadLetterQueue = deadLetterQueue;
  }
  if (workerConcurrency !== undefined) {
    config.workerConcurrency = workerConcurrency;
  }

  if (missingKeys.length > 0) {
    return {
      mode,
      productionReady: false,
      configReady: false,
      blockedReason: "QUEUE_BROKER_CONTRACT_INCOMPLETE",
      requiredExternal,
      readiness,
      config,
      missingKeys
    };
  }

  return {
    mode,
    productionReady: false,
    configReady: true,
    blockedReason: "QUEUE_BROKER_ADAPTER_NOT_CONNECTED",
    requiredExternal,
    readiness,
    config
  };
}

export function buildProductionSessionInvalidationStoreContract(
  env: Record<string, string | undefined> = process.env
): ProductionSessionInvalidationStoreContract {
  const requiredExternal = ["database", "redis", "multiInstanceSmoke"];
  const readiness = {
    nextAction:
      "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
    requiredChecks: [
      "two-instance-session-invalidation-smoke",
      "token-hash-ttl-verification",
      "raw-token-not-persisted-check",
      "login-rotation-cross-instance-smoke"
    ]
  };
  const explicitModeValue = readSessionInvalidationEnvValue(env, "SESSION_INVALIDATION_STORE_MODE");
  const hasDatabaseUrl = readSessionInvalidationEnvValue(env, "DATABASE_URL") !== undefined;
  const defaultToRepository = explicitModeValue === undefined && hasDatabaseUrl;
  const mode: ProductionSessionInvalidationStoreMode =
    explicitModeValue === "repository" || defaultToRepository
      ? "repository"
      : "in-memory";

  if (mode === "in-memory") {
    return {
      mode,
      productionReady: false,
      configReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_IN_MEMORY",
      requiredExternal,
      readiness,
      config: {}
    };
  }

  const provider = readSessionInvalidationStoreProvider(env);
  const invalidationTtlMs = readSessionInvalidationPositiveInteger(env, "SESSION_INVALIDATION_TTL_MS");
  const redisKeyPrefix = readSessionInvalidationEnvValue(env, "SESSION_INVALIDATION_REDIS_KEY_PREFIX");
  const missingKeys = [
    ...(provider === undefined ? ["SESSION_INVALIDATION_STORE_PROVIDER"] : []),
    ...(invalidationTtlMs === undefined ? ["SESSION_INVALIDATION_TTL_MS"] : [])
  ];
  const config: ProductionSessionInvalidationStoreContract["config"] = {};

  if (provider !== undefined) {
    config.provider = provider;
  }
  if (invalidationTtlMs !== undefined) {
    config.invalidationTtlMs = invalidationTtlMs;
  }
  if (provider === "redis" && redisKeyPrefix !== undefined) {
    config.redisKeyPrefix = redisKeyPrefix;
  }

  if (missingKeys.length > 0) {
    return {
      mode,
      productionReady: false,
      configReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_CONTRACT_INCOMPLETE",
      requiredExternal,
      readiness,
      config,
      missingKeys
    };
  }

  return {
    mode,
    productionReady: false,
    configReady: true,
    blockedReason: "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED",
    requiredExternal,
    readiness,
    config
  };
}

export function createProductionSessionInvalidationStore(
  options: CreateProductionSessionInvalidationStoreOptions = {}
): SessionInvalidationStore | undefined {
  const env = options.env ?? process.env;
  const contract = buildProductionSessionInvalidationStoreContract(env);

  if (contract.mode === "in-memory") {
    console.warn("[session-invalidation] ⚠️ 使用内存模式，多实例部署下 session 失效将不可靠。设置 SESSION_INVALIDATION_STORE_MODE=repository 以启用持久化。");
  }

  if (contract.mode !== "repository" || !contract.configReady) {
    return undefined;
  }

  const { provider, invalidationTtlMs } = contract.config;
  if (provider === undefined || invalidationTtlMs === undefined) {
    return undefined;
  }

  const repository =
    options.repository ??
    (provider === "database" && options.databaseDelegate
      ? createDatabaseSessionInvalidationRepository({ delegate: options.databaseDelegate })
      : provider === "redis" && options.redisClient
        ? createRedisSessionInvalidationRepository({
            client: options.redisClient,
            ...(contract.config.redisKeyPrefix !== undefined ? { keyPrefix: contract.config.redisKeyPrefix } : {})
          })
        : undefined);

  if (repository === undefined) {
    return undefined;
  }

  const storeOptions: Parameters<typeof createRepositorySessionInvalidationStore>[0] = {
    repository,
    provider,
    invalidationTtlMs
  };
  if (options.now !== undefined) {
    storeOptions.now = options.now;
  }

  return createRepositorySessionInvalidationStore(storeOptions);
}

export function assertProductionQueueContract(contract: ProductionQueueContract) {
  if (!contract.productionReady) {
    const missing = contract.missingKeys && contract.missingKeys.length > 0 ? `: ${contract.missingKeys.join(", ")}` : "";
    throw new Error(`${contract.blockedReason ?? "QUEUE_CONTRACT_NOT_PRODUCTION_READY"}${missing}`);
  }
}

export function createProductionJobQueueAdapter(
  options: CreateProductionJobQueueAdapterOptions = {}
): JobQueueAdapter | undefined {
  const env = options.env ?? process.env;
  const contract = buildProductionQueueContract(env);

  if (contract.mode !== "broker" || !contract.configReady) {
    return undefined;
  }

  if (contract.config.brokerProvider !== "redis") {
    return undefined;
  }

  const { queueName, visibilityTimeoutMs, retryLimit, deadLetterQueue } = contract.config;
  if (
    !options.redisClient ||
    queueName === undefined ||
    visibilityTimeoutMs === undefined ||
    retryLimit === undefined ||
    deadLetterQueue === undefined
  ) {
    return undefined;
  }

  const adapterOptions: Parameters<typeof createRedisJobQueueAdapter>[0] = {
    client: options.redisClient,
    queueName,
    deadLetterQueue,
    visibilityTimeoutMs,
    retryLimit
  };
  if (options.now !== undefined) {
    adapterOptions.now = options.now;
  }

  return createRedisJobQueueAdapter(adapterOptions);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isInputJsonObject(value: unknown): value is Prisma.InputJsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPayloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNestedArray(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return Array.isArray(current) ? current : undefined;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  // Provider 配置来自 JSON 字段，HTTP headers 只接受字符串键值，避免把嵌套对象或数字透传到真实服务。
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function readModelCandidates(value: unknown): ModelFieldCandidate[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  // Legacy/test extraction candidates 来自 JSON 配置，这里做最小结构校验，避免保存的脏 JSON 直接进入抽取结果。
  const candidates = value.filter((item): item is ModelFieldCandidate => {
    const candidate = readPayloadRecord(item);
    return typeof candidate.fieldKey === "string" && typeof candidate.rawValue === "string" && Array.isArray(candidate.evidence);
  });

  return candidates.length > 0 ? candidates : undefined;
}

function readOcrBlocks(value: unknown): OcrTextBlock[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  // Legacy/test OCR blocks 同样来自在线配置，必须至少具备页码、块 ID 和文本，后续坐标等字段由核心 provider 自己兜底。
  const blocks = value.filter((item): item is OcrTextBlock => {
    const block = readPayloadRecord(item);
    return typeof block.page === "number" && typeof block.blockId === "string" && typeof block.text === "string";
  });

  return blocks.length > 0 ? blocks : undefined;
}

function isWritebackValue(value: unknown): value is string | number | boolean | string[] | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function readReadyFields(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = readPayloadRecord(item);
    const fieldKey = readOptionalString(record.fieldKey);
    const targetPath = readOptionalString(record.targetPath);

    if (!fieldKey || !targetPath || !isWritebackValue(record.value)) {
      return [];
    }

    return [
      {
        fieldKey,
        targetPath,
        value: record.value
      }
    ];
  });
}

function readReadyFieldsFromRecognitionResult(result: unknown) {
  const resultRecord = readPayloadRecord(result);
  const payload = readPayloadRecord(resultRecord.payload);

  return readReadyFields(readNestedArray(payload, ["writeback", "readyFields"]));
}

function isServerReadyWritebackJob(job: unknown, result: unknown, readyFields: ReturnType<typeof readReadyFields>) {
  const jobRecord = readPayloadRecord(job);
  const resultRecord = readPayloadRecord(result);
  const status = readString(jobRecord.status, "");

  return (status === "completed" || status === "confirmed") && resultRecord.reviewRequired !== true && readyFields.length > 0;
}

function isBlockingProductionWritebackAttempt(attempt: unknown) {
  const record = readPayloadRecord(attempt);
  return record.status === "pending" || record.status === "running" || record.status === "succeeded";
}

function createProductionWritebackError(code: string, statusCode: number) {
  return Object.assign(new Error(code), {
    code,
    statusCode
  });
}

function readRequestedByUserId(body: Record<string, unknown>) {
  const actor = readPayloadRecord(body.actor);
  return readString(body.requestedByUserId, readString(actor.actorUserId, "system"));
}

function buildOcrProvider(env: ProductionEnv, runtimeOptions: ProviderRuntimeOptions) {
  if (env.providers.ocr.provider === "http") {
    return createOcrProvider({
      kind: "http",
      http: {
        endpoint: env.providers.ocr.endpoint ?? "",
        headers: env.providers.ocr.apiKey ? { Authorization: `Bearer ${env.providers.ocr.apiKey}` } : {},
        ...(runtimeOptions.providerRuntimeFetch ? { fetchFn: runtimeOptions.providerRuntimeFetch } : {}),
        timeoutMs: 30_000
      }
    });
  }

  return createUnconfiguredOcrProvider();
}

function buildModelProvider(
  env: ProductionEnv,
  options: {
    langChainModel?: LangChainModelLike;
    openAiResponsesClient?: OpenAiResponsesClientLike;
  } = {}
) {
  if (env.providers.llm.provider === "openai-compatible") {
    const httpConfig: Parameters<typeof createModelProvider>[0] = {
      kind: "http",
      http: {
        endpoint: env.providers.llm.baseUrl ?? "",
        model: env.providers.llm.model,
        timeoutMs: 90_000
      }
    };

    if (env.providers.llm.apiKey) {
      httpConfig.http.apiKey = env.providers.llm.apiKey;
    }

    return createModelProvider({
      ...httpConfig
    });
  }

  if (env.providers.llm.provider === "langchain") {
    const apiKey = env.providers.llm.openAiApiKey ?? env.providers.llm.apiKey;
    const openAiLangChainConfig: Parameters<typeof createOpenAiLangChainModel>[0] | undefined = apiKey
      ? {
          apiKey,
          model: env.providers.llm.model
        }
      : undefined;

    if (openAiLangChainConfig && env.providers.llm.baseUrl) {
      openAiLangChainConfig.baseUrl = env.providers.llm.baseUrl;
    }

    const model =
      options.langChainModel ??
      (openAiLangChainConfig ? createOpenAiLangChainModel(openAiLangChainConfig) : undefined);

    if (!model) {
      // 测试或部署层绕过 env 校验时仍然要在启动阶段失败，避免无密钥状态被误判为真实模型可用。
      throw new Error("LANGCHAIN_MODEL_NOT_CONFIGURED");
    }

    return createModelProvider({
      kind: "langchain",
      langchain: {
        providerName: "langchain-model",
        model
      }
    });
  }

  if (env.providers.llm.provider === "openai-responses") {
    const client =
      options.openAiResponsesClient ??
      createOpenAiResponsesClient({
        apiKey: env.providers.llm.openAiApiKey ?? ""
      });

    return createModelProvider({
      kind: "openai-responses",
      openAiResponses: {
        model: env.providers.llm.model,
        experimental: {
          enabled: true
        },
        client
      }
    });
  }

  return createUnconfiguredModelProvider();
}

function buildModelProviderOptions(options: CreateProductionApiServicesOptions) {
  const modelProviderOptions: ProviderRuntimeOptions = {
    secretResolver: options.secretResolver ?? createSecretResolverFromEnv()
  };

  if (options.langChainModel) {
    modelProviderOptions.langChainModel = options.langChainModel;
  }

  if (options.openAiResponsesClient) {
    modelProviderOptions.openAiResponsesClient = options.openAiResponsesClient;
  }

  if (options.providerRuntimeFetch) {
    modelProviderOptions.providerRuntimeFetch = options.providerRuntimeFetch;
  }

  return modelProviderOptions;
}

type ProviderRuntimeOptions = {
  langChainModel?: LangChainModelLike;
  openAiResponsesClient?: OpenAiResponsesClientLike;
  providerRuntimeFetch?: ProviderRuntimeFetch;
  secretResolver: SecretResolver;
};

function readSavedProviderMode(config: Record<string, unknown>) {
  return readString(config.providerKind, readString(config.provider, readString(config.kind, ""))).toLowerCase();
}

function readSecretRef(secretRefs: Record<string, unknown>, key: string) {
  const value = secretRefs[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function resolveSecretValue(input: {
  secretRefs: Record<string, unknown>;
  key: string;
  resolver: SecretResolver;
}) {
  const ref = readSecretRef(input.secretRefs, input.key);
  if (!ref) {
    return undefined;
  }

  const result = await input.resolver.resolve(ref);
  return result.resolved ? result.value : null;
}

async function resolveSecretForDiagnostics(input: {
  secretRefs: Record<string, unknown>;
  key: string;
  resolver: SecretResolver;
}) {
  const ref = readSecretRef(input.secretRefs, input.key);
  if (!ref) {
    return {
      resolved: true as const,
      value: undefined,
      diagnostic: undefined
    };
  }

  const result = await input.resolver.resolve(ref);
  if (result.resolved) {
    return {
      resolved: true as const,
      value: result.value,
      diagnostic: {
        secretRef: ref,
        source: result.source,
        resolved: true as const
      }
    };
  }

  return {
    resolved: false as const,
    value: undefined,
    diagnostic: {
      secretRef: ref,
      source: result.source,
      resolved: false as const,
      blockedReason: result.reason
    }
  };
}

async function buildSavedOcrProvider(input: {
  key: string;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  runtimeOptions: ProviderRuntimeOptions;
}): Promise<OcrProvider | null> {
  const mode = readSavedProviderMode(input.config);

  if (mode === "mock") {
    return null;
  }

  // HTTP OCR provider 只在 endpoint 完整时实例化；缺配置返回 null，由上层转成显式 provider 不可用结果。
  if (mode === "http" || mode === "openai-compatible") {
    const endpoint = readOptionalString(input.config.endpoint);
    if (!endpoint) {
      return null;
    }
    const apiKey = await resolveSecretValue({
      secretRefs: input.secretRefs,
      key: "apiKey",
      resolver: input.runtimeOptions.secretResolver
    });
    if (apiKey === null) {
      return null;
    }

    return createOcrProvider({
      kind: "http",
      http: {
        providerName: input.key,
        endpoint,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...readStringRecord(input.config.headers)
        },
        ...(input.runtimeOptions.providerRuntimeFetch ? { fetchFn: input.runtimeOptions.providerRuntimeFetch } : {}),
        timeoutMs: readNumber(input.config.timeoutMs, 30_000)
      }
    });
  }

  return null;
}

async function buildSavedModelProvider(input: {
  key: string;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  runtimeOptions: ProviderRuntimeOptions;
}): Promise<ModelProvider | null> {
  const mode = readSavedProviderMode(input.config);
  const model = readString(input.config.modelOrBucket, readString(input.config.model, "unconfigured-real-model"));

  if (mode === "mock") {
    return null;
  }

  // 在线保存的 HTTP / OpenAI-compatible 配置从非敏感 JSON 字段读取 endpoint、model 和 headers；
  // apiKey 只通过 secretRefs 交给可插拔 resolver 解析，不从 provider config 明文字段读取。
  if (mode === "http" || mode === "openai-compatible") {
    const endpoint = readOptionalString(input.config.endpoint);
    if (!endpoint) {
      return null;
    }
    const apiKey = await resolveSecretValue({
      secretRefs: input.secretRefs,
      key: "apiKey",
      resolver: input.runtimeOptions.secretResolver
    });
    if (apiKey === null) {
      return null;
    }

    return createModelProvider({
      kind: "http",
      http: {
        providerName: input.key,
        endpoint,
        model,
        ...(apiKey ? { apiKey } : {}),
        headers: readStringRecord(input.config.headers),
        ...(input.runtimeOptions.providerRuntimeFetch ? { fetchFn: input.runtimeOptions.providerRuntimeFetch } : {}),
        timeoutMs: readNumber(input.config.timeoutMs, 30_000)
      }
    });
  }

  if (mode === "openai responses" || mode === "openai-responses") {
    const client = input.runtimeOptions.openAiResponsesClient;
    if (!client) {
      return null;
    }

    return createModelProvider({
      kind: "openai-responses",
      openAiResponses: {
        providerName: input.key,
        model,
        experimental: {
          enabled: true
        },
        client
      }
    });
  }

  // LangChain provider 必须由启动层注入真实模型实例；没有注入时拒绝实例化，避免空模型伪成功。
  if (mode === "langchain") {
    const langChainModel = input.runtimeOptions.langChainModel;
    if (!langChainModel) {
      return null;
    }

    return createModelProvider({
      kind: "langchain",
      langchain: {
        providerName: input.key,
        model: langChainModel
      }
    });
  }

  return null;
}

function buildStorageProvider(env: ProductionEnv): StorageProvider {
  if (env.storage.driver === "s3") {
    const s3 = env.storage.s3;

    return createS3StorageProvider({
      bucket: s3.bucket ?? "",
      client: createS3Client({
        endpoint: s3.endpoint ?? "",
        region: s3.region ?? "",
        accessKeyId: s3.accessKeyId ?? "",
        secretAccessKey: s3.secretAccessKey ?? ""
      })
    });
  }

  return createLocalStorageProvider({
    rootDir: env.storage.localDir
  });
}

function getConfiguredOcrProviderKey(env: ProductionEnv) {
  return env.providers.ocr.provider === "http" ? "http-ocr" : undefined;
}

function getConfiguredModelProviderKey(env: ProductionEnv) {
  if (env.providers.llm.provider === "none") {
    return undefined;
  }

  return env.providers.llm.provider === "openai-compatible" ? "openai-compatible-model" : `${env.providers.llm.provider}-model`;
}

function createRealProviderNotConfiguredError(providerName: string) {
  return Object.assign(new Error("请先配置真实 OCR/LLM Provider；等待接入真实模型提供商。"), {
    code: "REAL_PROVIDER_NOT_CONFIGURED",
    statusCode: 503,
    providerName,
    retryable: false
  });
}

function createUnconfiguredOcrProvider(): OcrProvider {
  const providerName = "unconfigured-ocr-provider";

  return {
    providerName,
    async recognize() {
      throw createRealProviderNotConfiguredError(providerName);
    }
  };
}

function createUnconfiguredModelProvider(): ModelProvider {
  const providerName = "unconfigured-model-provider";

  return {
    providerName,
    async extractFields() {
      throw createRealProviderNotConfiguredError(providerName);
    }
  };
}

function createConfigurationFailureResult(jobId: string, error: JobOrchestratorResult["error"]): JobOrchestratorResult {
  if (!error) {
    throw new Error("生产编排配置失败结果必须包含脱敏 error。");
  }

  // 配置失败发生在 OCR/LLM 调用之前，因此返回空 validation/writeback 结构，
  // 让结果存储、详情页和评估页都能按普通失败任务处理，而不会误触发自动写回。
  return {
    jobId,
    status: "failed",
    trace: [
      {
        node: "preprocess",
        status: "failed",
        message: error.message
      }
    ],
    validation: {
      decision: "blocked",
      fieldResults: [],
      requiredFieldKeys: [],
      missingRequiredFieldKeys: [],
      acceptedFieldKeys: [],
      reviewFieldKeys: [],
      normalizedCandidates: []
    },
    autoDecision: {
      decision: "red",
      shouldWriteback: false,
      reasons: [
        {
          code: "SCHEMA_INACTIVE",
          message: error.message
        }
      ]
    },
    writeback: {
      ready: false,
      readyFields: [],
      blockers: [
        {
          code: "NO_AUTO_FIELDS",
          message: error.message
        }
      ]
    },
    error
  };
}

function createProviderConfigFailureResult(jobId: string): JobOrchestratorResult {
  const error = {
    code: "PROVIDER_CONFIG_NOT_AVAILABLE",
    message: "识别任务选择的 provider 未在当前生产环境启用。",
    retryable: false
  };

  return createConfigurationFailureResult(jobId, error);
}

function createSchemaConfigFailureResult(jobId: string): JobOrchestratorResult {
  const error = {
    code: "SCHEMA_CONFIG_NOT_AVAILABLE",
    message: "识别任务选择的 schema 未在当前生产编排中启用。",
    retryable: false
  };

  return createConfigurationFailureResult(jobId, error);
}

type ProviderConfigOrchestratorInput = Parameters<JobOrchestrator["start"]>[0] & {
  providerConfig?: unknown;
  schemaKey?: string;
  schemaVersionId?: string;
};

type ProductionSchemaRepository = Pick<ReturnType<typeof createSchemaRepository>, "findActiveVersionBySchemaKey" | "findVersionById">;

type ProductionSchemaResolution =
  | {
      schema: CoreSchemaDraft;
      source: "database" | "builtin";
      schemaKey: string;
      schemaVersionId?: string;
    }
  | null;

type ProductionProviderRuntimeSelection = {
  ocrProvider?: OcrProvider;
  modelProvider?: ModelProvider;
};

type ProductionRecognitionOrchestratorFactory = (
  schema: CoreSchemaDraft,
  providers?: ProductionProviderRuntimeSelection
) => JobOrchestrator;

function isUsableCoreSchemaDraft(value: unknown): value is CoreSchemaDraft {
  return validateCoreSchemaDraftInput(value).valid;
}

async function resolveProductionRecognitionSchema(input: {
  schemaKey?: string;
  schemaVersionId?: string;
  schemaRepository: ProductionSchemaRepository;
}): Promise<ProductionSchemaResolution> {
  if (input.schemaVersionId !== undefined) {
    const schemaVersion = await input.schemaRepository.findVersionById(input.schemaVersionId);
    const schemaVersionRecord = readPayloadRecord(schemaVersion);
    const definition = schemaVersionRecord.definition;

    if (!schemaVersion || !isUsableCoreSchemaDraft(definition)) {
      return null;
    }

    const schema = definition;
    const schemaKey = readString(schemaVersionRecord.schemaKey, schema.key);

    return {
      schema,
      source: "database",
      schemaKey,
      schemaVersionId: input.schemaVersionId
    };
  }

  const schemaKey = input.schemaKey ?? limsClinicalInfoSchema.key;
  const activeSchemaVersion = await input.schemaRepository.findActiveVersionBySchemaKey(schemaKey);

  if (activeSchemaVersion) {
    const activeSchemaRecord = readPayloadRecord(activeSchemaVersion);
    // 数据库 active schema 是生产识别的运行时契约：字段列表会约束抽取，
    // adapterHints.limsTargetPath 会继续进入 writebackAgent 并决定最终写回 payload。
    // 因此这里必须先复用 core schema 校验，避免损坏的线上定义进入真实识别链路。
    if (!isUsableCoreSchemaDraft(activeSchemaRecord.definition)) {
      return null;
    }

    const schema = activeSchemaRecord.definition;
    const schemaVersionId = readOptionalString(activeSchemaRecord.id);

    return {
      schema,
      source: "database",
      schemaKey,
      ...(schemaVersionId !== undefined ? { schemaVersionId } : {})
    };
  }

  if (schemaKey === limsClinicalInfoSchema.key) {
    // 内置 LIMS 临床信息 schema 只作为兼容回退：数据库没有 active 版本时继续保持旧部署可用；
    // 未知 custom schema 不走这个分支，避免把用户选择的 schema 静默替换成默认字段映射。
    return {
      schema: limsClinicalInfoSchema,
      source: "builtin",
      schemaKey: limsClinicalInfoSchema.key
    };
  }

  return null;
}

async function resolveSavedProviderRuntime(input: {
  key: string;
  expectedKind: "ocr" | "llm";
  providerRepository: ProductionProviderRepository;
  runtimeOptions: ProviderRuntimeOptions;
}): Promise<OcrProvider | ModelProvider | null> {
  // 运行时只接受已启用且 kind 匹配的 provider，避免调用方把 LLM key 填到 OCR 字段后误用默认服务。
  const provider = await input.providerRepository.findByKey(input.key);
  if (!provider || provider.status !== "active" || provider.kind !== input.expectedKind) {
    return null;
  }

  const config = isInputJsonObject(provider.config) ? provider.config : {};
  const secretRefs = isInputJsonObject(provider.secretRefs) ? provider.secretRefs : {};

  if (input.expectedKind === "ocr") {
    return buildSavedOcrProvider({
      key: provider.key,
      config,
      secretRefs,
      runtimeOptions: input.runtimeOptions
    });
  }

  const result = await buildSavedModelProvider({
    key: provider.key,
    config,
    secretRefs,
    runtimeOptions: input.runtimeOptions
  });
  return result;
}

async function findDefaultSavedProviderKey(input: {
  expectedKind: "ocr" | "llm";
  providerRepository: ProductionProviderRepository;
}) {
  const allProviders = await input.providerRepository.list();
  for (const provider of allProviders) {
    const normalizedProvider = normalizeProviderConfigRecord({
      ...provider,
      enabled: provider.status !== "disabled"
    });
    if (
      normalizedProvider.kind === input.expectedKind &&
      normalizedProvider.enabled &&
      normalizedProvider.isDefault &&
      !normalizedProvider.isMock &&
      normalizedProvider.status === "active"
    ) {
      return normalizedProvider.key;
    }
  }

  return undefined;
}

async function resolveProductionProviderRuntime(input: {
  env: ProductionEnv;
  providerRepository: ProductionProviderRepository;
  runtimeOptions: ProviderRuntimeOptions;
  providerConfig: unknown;
}): Promise<{
  available: boolean;
  providers?: ProductionProviderRuntimeSelection;
}> {
  const config = readPayloadRecord(input.providerConfig);
  const ocrProviderKey = readOptionalString(config.ocrProviderKey);
  const modelProviderKey = readOptionalString(config.providerKey);
  const configuredOcrProviderKey = getConfiguredOcrProviderKey(input.env);
  const configuredModelProviderKey = getConfiguredModelProviderKey(input.env);
  const effectiveOcrProviderKey =
    ocrProviderKey ??
    configuredOcrProviderKey ??
    (await findDefaultSavedProviderKey({
      expectedKind: "ocr",
      providerRepository: input.providerRepository
    }));
  const effectiveModelProviderKey =
    modelProviderKey ??
    (await findDefaultSavedProviderKey({
      expectedKind: "llm",
      providerRepository: input.providerRepository
    })) ??
    configuredModelProviderKey;
  const providers: ProductionProviderRuntimeSelection = {};

  // 调用方选择 env 默认 key 时无需重新实例化；只有选择在线保存的非默认 key 时才读取数据库配置。
  if (effectiveOcrProviderKey === undefined) {
    return { available: false };
  }
  if (effectiveModelProviderKey === undefined) {
    return { available: false };
  }

  if (effectiveOcrProviderKey !== configuredOcrProviderKey) {
    const provider = await resolveSavedProviderRuntime({
      key: effectiveOcrProviderKey,
      expectedKind: "ocr",
      providerRepository: input.providerRepository,
      runtimeOptions: input.runtimeOptions
    });
    if (!provider) {
      return { available: false };
    }
    providers.ocrProvider = provider as OcrProvider;
  }

  if (effectiveModelProviderKey !== configuredModelProviderKey) {
    const provider = await resolveSavedProviderRuntime({
      key: effectiveModelProviderKey,
      expectedKind: "llm",
      providerRepository: input.providerRepository,
      runtimeOptions: input.runtimeOptions
    });
    if (!provider) {
      return { available: false };
    }
    providers.modelProvider = provider as ModelProvider;
  }

  if (Object.keys(providers).length > 0) {
    return {
      available: true,
      providers
    };
  }

  return {
    available: true
  };
}

function createProviderConfigAwareOrchestrator(input: {
  env: ProductionEnv;
  schemaRepository: ProductionSchemaRepository;
  providerRepository: ProductionProviderRepository;
  runtimeOptions: ProviderRuntimeOptions;
  builtinOrchestrator: JobOrchestrator;
  createOrchestrator: ProductionRecognitionOrchestratorFactory;
}): JobOrchestrator {
  return {
    workflow: input.builtinOrchestrator.workflow,
    async start(jobInput: ProviderConfigOrchestratorInput) {
      const providerSelection = await resolveProductionProviderRuntime({
        env: input.env,
        providerRepository: input.providerRepository,
        runtimeOptions: input.runtimeOptions,
        providerConfig: jobInput.providerConfig
      });

      // 生产模式允许调用方选择环境内置 provider，或 Provider Settings 中保存并启用的 provider。
      // 未启用、kind 不匹配或缺少必要 endpoint/client 的配置必须显式失败，避免病历文本静默落回默认 provider。
      if (!providerSelection.available) {
        return createProviderConfigFailureResult(jobInput.jobId);
      }

      const schemaResolveInput: Parameters<typeof resolveProductionRecognitionSchema>[0] = {
        schemaRepository: input.schemaRepository
      };
      if (jobInput.schemaKey !== undefined) {
        schemaResolveInput.schemaKey = jobInput.schemaKey;
      }
      if (jobInput.schemaVersionId !== undefined) {
        schemaResolveInput.schemaVersionId = jobInput.schemaVersionId;
      }

      const schemaResolution = await resolveProductionRecognitionSchema(schemaResolveInput);
      if (!schemaResolution) {
        return createSchemaConfigFailureResult(jobInput.jobId);
      }

      const orchestrator =
        schemaResolution.source === "builtin" && !providerSelection.providers
          ? input.builtinOrchestrator
          : input.createOrchestrator(createProductionRecognitionSchema(schemaResolution.schema), providerSelection.providers);

      return orchestrator.start(jobInput);
    }
  };
}

function createProductionRecognitionSchema(schema: CoreSchemaDraft): CoreSchemaDraft {
  return {
    ...schema,
    fields: schema.fields.map((field) => {
      if (!field.adapterHints?.limsTargetPath) {
        return field;
      }

      // 生产识别主链路执行高置信自动写回；是否真正写回仍由 validation、auto decision 和权限共同决定。
      return {
        ...field,
        adapterHints: {
          ...field.adapterHints,
          writebackMode: "auto" as const
        }
      };
    })
  };
}

function buildStorageHealthProbeKey(now: () => Date) {
  return `health-check/provider-health-${now().toISOString().replace(/[:.]/g, "-")}.txt`;
}

async function runStorageHealthProbe(storageProvider: StorageProvider, now: () => Date) {
  const key = buildStorageHealthProbeKey(now);
  const body = Buffer.from("health-check");
  const startedAt = Date.now();

  try {
    // 存储健康检查使用固定小文件做受控读写删除探针，不写入任何病历原文或患者信息。
    const storedFile = await storageProvider.put({
      key,
      body,
      contentType: "text/plain"
    });
    const loadedFile = await storageProvider.get(storedFile.key);

    if (!loadedFile || !loadedFile.body.equals(body)) {
      return {
        status: "degraded" as const,
        latencyMs: Date.now() - startedAt,
        message: "Storage provider 探针读回内容不一致。",
        probe: {
          key: storedFile.key,
          size: storedFile.size,
          verified: false
        }
      };
    }

    return {
      status: "healthy" as const,
      latencyMs: Date.now() - startedAt,
      message: "Storage provider 受控读写删除探针通过。",
      probe: {
        key: storedFile.key,
        size: storedFile.size,
        verified: true
      }
    };
  } catch {
    return {
      status: "degraded" as const,
      latencyMs: Date.now() - startedAt,
      message: "Storage provider 探针失败，请检查存储权限、网络或 bucket/rootDir 配置。",
      probe: {
        key,
        size: body.byteLength,
        verified: false
      }
    };
  } finally {
    try {
      await storageProvider.delete(key);
    } catch {
      // 健康检查的主结果不应被清理失败覆盖；清理失败本身会在后续探针中体现为存储异常。
    }
  }
}

async function runOcrHealthProbe(input: {
  endpoint: string;
  apiKey?: string;
  healthFetch: ProviderHealthFetch;
}) {
  const startedAt = Date.now();
  const method = "GET";
  const requestInit: RequestInit = {
    method
  };

  if (input.apiKey) {
    requestInit.headers = {
      Authorization: `Bearer ${input.apiKey}`
    };
  }

  try {
    // OCR 健康检查用 GET 最小探针
    const response = await input.healthFetch(input.endpoint, requestInit);

    return {
      status: response.ok ? ("healthy" as const) : ("degraded" as const),
      latencyMs: Date.now() - startedAt,
      message: response.ok ? "HTTP OCR provider 最小健康探针通过。" : "HTTP OCR provider 最小健康探针未通过。",
      probe: {
        method,
        url: input.endpoint,
        statusCode: response.status
      }
    };
  } catch {
    return {
      status: "unhealthy" as const,
      latencyMs: Date.now() - startedAt,
      message: "HTTP OCR provider 健康探针失败，请检查 endpoint、认证或内网连通性。",
      probe: {
        method,
        url: input.endpoint
      }
    };
  }
}

async function runLimsHealthProbe(input: {
  endpoint: string;
  apiToken: string;
  healthFetch: ProviderHealthFetch;
}) {
  const startedAt = Date.now();
  const method = "POST";

  try {
    // LIMS 健康检查沿用写回 endpoint，但使用 dry-run/ping 语义，避免产生真实业务写回。
    const response = await input.healthFetch(input.endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        dryRun: true,
        ping: true,
        source: "provider-health"
      })
    });

    return {
      status: response.ok ? ("healthy" as const) : ("degraded" as const),
      latencyMs: Date.now() - startedAt,
      message: response.ok
        ? "LIMS writeback adapter dry-run ping 通过。"
        : "LIMS writeback adapter dry-run ping 未通过，请检查 LIMS 服务状态。",
      probe: {
        method,
        url: input.endpoint,
        statusCode: response.status,
        dryRun: true
      }
    };
  } catch {
    return {
      status: "unhealthy" as const,
      latencyMs: Date.now() - startedAt,
      message: "LIMS writeback adapter dry-run ping 失败，请检查 endpoint、token 或内网连通性。",
      probe: {
        method,
        url: input.endpoint,
        dryRun: true
      }
    };
  }
}

function normalizeProviderConfigRecord(provider: Record<string, unknown>): ProviderRegistryItem {
  const key = readString(provider.key, "unknown-provider");
  const displayName = readString(provider.displayName, readString(provider.name, key));
  const kind = parseProviderKind(readString(provider.kind, "llm"));
  const config = isInputJsonObject(provider.config) ? provider.config : {};
  const providerMode = readSavedProviderMode(config as Record<string, unknown>);
  const status = typeof provider.status === "string" ? provider.status.toLowerCase() : undefined;
  const isMock =
    provider.isMock === true ||
    status === "development" + "_placeholder" ||
    providerMode === "mock" ||
    key.startsWith("mock-") ||
    displayName.toLowerCase().includes("mock");

  return {
    key,
    kind,
    name: displayName,
    displayName,
    enabled: isMock ? false : typeof provider.enabled === "boolean" ? provider.enabled : provider.status !== "disabled",
    isDefault: isMock ? false : provider.isDefault === true,
    isMock,
    config,
    secretRefs: isInputJsonObject(provider.secretRefs) ? provider.secretRefs : {},
    status: isMock ? "hidden" : provider.status
  };
}

function parseProviderKind(kind: string) {
  if (kind === "ocr" || kind === "llm" || kind === "storage" || kind === "lims") {
    return kind;
  }

  throw Object.assign(new Error("PROVIDER_KIND_INVALID"), {
    code: "PROVIDER_KIND_INVALID",
    statusCode: 400
  });
}

function createProviderRegistry(
  env: ProductionEnv,
  storageProvider: StorageProvider,
  now: () => Date,
  providerHealthFetch: ProviderHealthFetch,
  providerRepository: ProductionProviderRepository,
  secretResolver: SecretResolver
): ProviderRegistry {
  const environmentProviders: EnvironmentProviderConfig[] = [
    ...(env.providers.ocr.provider === "http"
      ? [
          {
            key: "http-ocr",
            kind: "ocr" as const,
            displayName: "PaddleOCR 本地服务",
            enabled: true,
            isDefault: true,
            isMock: false,
            config: {
              provider: env.providers.ocr.provider,
              endpoint: env.providers.ocr.endpoint ?? null
            },
            secretRefs: env.providers.ocr.apiKey ? { apiKey: "configured" } : {}
          }
        ]
      : []),
    ...(env.providers.llm.provider !== "none"
      ? [
          {
            key: env.providers.llm.provider === "openai-compatible" ? "openai-compatible-model" : `${env.providers.llm.provider}-model`,
            kind: "llm" as const,
            displayName: env.providers.llm.model ? `${env.providers.llm.model.toUpperCase()} (${env.providers.llm.provider})` : `${env.providers.llm.provider} Model Provider`,
            enabled: true,
            isDefault: true,
            isMock: false,
            config: {
              provider: env.providers.llm.provider,
              model: env.providers.llm.model,
              baseUrl: env.providers.llm.baseUrl ?? null
            },
            secretRefs: env.providers.llm.apiKey || env.providers.llm.openAiApiKey ? { apiKey: "configured" } : {}
          }
        ]
      : []),
    {
      key: "lims-writeback",
      kind: "lims",
      displayName: "LIMS Writeback Adapter",
      enabled: true,
      isDefault: true,
      isMock: false,
      config: {
        endpoint: new URL(env.lims.clinicalInfoEndpoint, env.lims.baseUrl).toString(),
        timeoutMs: env.lims.timeoutMs
      },
      secretRefs: env.lims.apiToken ? { apiToken: "configured" } : {}
    },
    {
      key: env.storage.driver === "s3" ? "s3-storage" : "local-storage",
      kind: "storage",
      displayName: env.storage.driver === "s3" ? "S3 Storage Provider" : "Local Storage Provider",
      enabled: true,
      isDefault: true,
      isMock: false,
      config: {
        driver: env.storage.driver,
        bucket: env.storage.driver === "s3" ? (env.storage.s3.bucket ?? null) : null,
        localDir: env.storage.driver === "local" ? env.storage.localDir : null
      },
      secretRefs:
        env.storage.driver === "s3" && (env.storage.s3.accessKeyId || env.storage.s3.secretAccessKey)
          ? { accessKeyId: "configured", secretAccessKey: "configured" }
          : {}
    }
  ];

  return {
    async list() {
      // Provider 列表只暴露配置状态，不返回密钥、token 或 header 原文。
      const providersByKey = new Map<string, ProviderRegistryItem>();
      for (const provider of environmentProviders) {
        providersByKey.set(provider.key, normalizeProviderConfigRecord(provider));
      }
      for (const provider of await providerRepository.list()) {
        const normalizedProvider = normalizeProviderConfigRecord({
          ...provider,
          enabled: provider.status !== "disabled"
        });
        if (!normalizedProvider.isMock) {
          providersByKey.set(provider.key, normalizedProvider);
        }
      }

      return Array.from(providersByKey.values());
    },
    async save(input) {
      const kind = parseProviderKind(input.kind);
      if (input.key.trim().length === 0 || input.displayName.trim().length === 0) {
        throw Object.assign(new Error("PROVIDER_CONFIG_INVALID"), {
          code: "PROVIDER_CONFIG_INVALID",
          statusCode: 400
        });
      }

      return providerRepository.save({
        key: input.key.trim(),
        kind,
        displayName: input.displayName.trim(),
        status: input.enabled ? "active" : "disabled",
        isDefault: input.isDefault,
        config: isInputJsonObject(input.config) ? input.config : {},
        secretRefs: isInputJsonObject(input.secretRefs) ? input.secretRefs : {},
        updatedById: input.actor.actorUserId
      });
    },
    async setDefault(key) {
      const currentPersistedProvider = await providerRepository.findByKey(key);
      if (currentPersistedProvider) {
        const currentNormalizedProvider = normalizeProviderConfigRecord({
          ...currentPersistedProvider,
          enabled: currentPersistedProvider.status !== "disabled"
        });
        if (currentNormalizedProvider.isMock) {
          throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
            code: "PROVIDER_NOT_FOUND",
            statusCode: 404
          });
        }

        const persistedProvider = await providerRepository.setDefault(key);
        if (!persistedProvider) {
          throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
            code: "PROVIDER_NOT_FOUND",
            statusCode: 404
          });
        }
        const normalizedProvider = normalizeProviderConfigRecord({
          ...persistedProvider,
          enabled: persistedProvider.status !== "disabled"
        });

        return normalizedProvider;
      }

      const provider = environmentProviders.find((item) => item.key === key);
      if (!provider) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }
      const normalizedProvider = normalizeProviderConfigRecord(provider);
      if (normalizedProvider.isMock) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }

      return {
        ...normalizedProvider,
        isDefault: true
      };
    },
    async checkHealth(key) {
      const persistedProvider = await providerRepository.findByKey(key);
      const provider = persistedProvider
        ? normalizeProviderConfigRecord({
            ...persistedProvider,
            enabled: persistedProvider.status !== "disabled"
          })
        : environmentProviders.find((item) => item.key === key);
      if (!provider) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }
      if (provider.isMock) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }
      const config = readPayloadRecord(provider.config);
      const savedMode = readSavedProviderMode(config);

      if (persistedProvider && provider.kind === "ocr" && (savedMode === "http" || savedMode === "openai-compatible")) {
        const endpoint = readOptionalString(config.endpoint);
        if (!endpoint) {
          return {
            key: provider.key,
            kind: provider.kind,
            status: "degraded",
            checkedAt: now().toISOString(),
            message: "Provider 配置不完整：endpoint。",
            latencyMs: 0,
            secretRefs: provider.secretRefs
          };
        }

        const secret = await resolveSecretForDiagnostics({
          secretRefs: provider.secretRefs,
          key: "apiKey",
          resolver: secretResolver
        });

        if (!secret.resolved) {
          return {
            key: provider.key,
            kind: provider.kind,
            status: "blocked",
            checkedAt: now().toISOString(),
            message: "Provider health blocked: secretRef 无法解析。",
            latencyMs: 0,
            blockedReason: secret.diagnostic.blockedReason,
            secretDiagnostics: {
              apiKey: secret.diagnostic
            },
            secretRefs: provider.secretRefs
          };
        }

        const probeInput: Parameters<typeof runOcrHealthProbe>[0] = {
          endpoint,
          healthFetch: providerHealthFetch
        };
        if (secret.value !== undefined) {
          probeInput.apiKey = secret.value;
        }
        const probe = await runOcrHealthProbe(probeInput);

        return {
          key: provider.key,
          kind: provider.kind,
          status: probe.status,
          checkedAt: now().toISOString(),
          message: probe.message,
          latencyMs: probe.latencyMs,
          probe: probe.probe,
          secretRefs: provider.secretRefs,
          ...(secret.diagnostic ? { secretDiagnostics: { apiKey: secret.diagnostic } } : {})
        };
      }

      if (persistedProvider && provider.kind === "llm" && (savedMode === "http" || savedMode === "openai-compatible")) {
        const endpoint = readOptionalString(config.endpoint);
        if (!endpoint) {
          return {
            key: provider.key,
            kind: provider.kind,
            status: "degraded",
            checkedAt: now().toISOString(),
            message: "Provider 配置不完整：endpoint。",
            latencyMs: 0,
            secretRefs: provider.secretRefs
          };
        }

        const secret = await resolveSecretForDiagnostics({
          secretRefs: provider.secretRefs,
          key: "apiKey",
          resolver: secretResolver
        });

        if (!secret.resolved) {
          return {
            key: provider.key,
            kind: provider.kind,
            status: "blocked",
            checkedAt: now().toISOString(),
            message: "Provider health blocked: secretRef 无法解析。",
            latencyMs: 0,
            blockedReason: secret.diagnostic.blockedReason,
            secretDiagnostics: {
              apiKey: secret.diagnostic
            },
            secretRefs: provider.secretRefs
          };
        }

        const requestInit: RequestInit = {
          method: "GET"
        };
        if (secret.value !== undefined) {
          requestInit.headers = {
            Authorization: `Bearer ${secret.value}`
          };
        }
        const startedAt = Date.now();
        try {
          // LLM 健康检查用 GET /models 端点
          const healthUrl = endpoint.endsWith("/") ? `${endpoint}models` : `${endpoint}/models`;
          const response = await providerHealthFetch(healthUrl, requestInit);

          return {
            key: provider.key,
            kind: provider.kind,
            status: response.ok ? "healthy" : "degraded",
            checkedAt: now().toISOString(),
            message: response.ok ? "HTTP LLM provider 最小健康探针通过。" : "HTTP LLM provider 最小健康探针未通过。",
            latencyMs: Date.now() - startedAt,
            probe: {
              method: "GET",
              url: healthUrl,
              statusCode: response.status
            },
            secretRefs: provider.secretRefs,
            ...(secret.diagnostic ? { secretDiagnostics: { apiKey: secret.diagnostic } } : {})
          };
        } catch {
          return {
            key: provider.key,
            kind: provider.kind,
            status: "unhealthy",
            checkedAt: now().toISOString(),
            message: "HTTP LLM provider 健康探针失败，请检查 endpoint、认证或内网连通性。",
            latencyMs: Date.now() - startedAt,
            probe: {
              method: "GET",
              url: endpoint
            },
            secretRefs: provider.secretRefs,
            ...(secret.diagnostic ? { secretDiagnostics: { apiKey: secret.diagnostic } } : {})
          };
        }
      }

      const missingConfig: string[] = [];
      if (provider.kind === "ocr" && provider.key === "http-ocr" && !env.providers.ocr.endpoint) {
        missingConfig.push("OCR_ENDPOINT");
      }
      if (provider.kind === "llm" && env.providers.llm.provider === "openai-compatible" && !env.providers.llm.baseUrl) {
        missingConfig.push("LLM_BASE_URL");
      }
      if (provider.kind === "llm" && env.providers.llm.provider === "openai-responses" && !env.providers.llm.openAiApiKey) {
        missingConfig.push("OPENAI_API_KEY");
      }
      if (provider.kind === "lims" && (!env.lims.baseUrl || !env.lims.apiToken)) {
        missingConfig.push("LIMS_BASE_URL", "LIMS_API_TOKEN");
      }
      if (provider.kind === "storage" && env.storage.driver === "s3" && !env.storage.s3.bucket) {
        missingConfig.push("S3_BUCKET");
      }

      if (provider.kind === "storage" && missingConfig.length === 0) {
        const probe = await runStorageHealthProbe(storageProvider, now);

        return {
          key: provider.key,
          kind: provider.kind,
          status: probe.status,
          checkedAt: now().toISOString(),
          message: probe.message,
          latencyMs: probe.latencyMs,
          probe: probe.probe,
          secretRefs: provider.secretRefs
        };
      }

      if (provider.kind === "ocr" && provider.key === "http-ocr" && missingConfig.length === 0) {
        const ocrProbeInput: Parameters<typeof runOcrHealthProbe>[0] = {
          endpoint: env.providers.ocr.endpoint ?? "",
          healthFetch: providerHealthFetch
        };
        if (env.providers.ocr.apiKey !== undefined) {
          ocrProbeInput.apiKey = env.providers.ocr.apiKey;
        }
        const probe = await runOcrHealthProbe(ocrProbeInput);

        return {
          key: provider.key,
          kind: provider.kind,
          status: probe.status,
          checkedAt: now().toISOString(),
          message: probe.message,
          latencyMs: probe.latencyMs,
          probe: probe.probe,
          secretRefs: provider.secretRefs
        };
      }

      if (provider.kind === "lims" && missingConfig.length === 0) {
        const probe = await runLimsHealthProbe({
          endpoint: new URL(env.lims.clinicalInfoEndpoint, env.lims.baseUrl).toString(),
          apiToken: env.lims.apiToken,
          healthFetch: providerHealthFetch
        });

        return {
          key: provider.key,
          kind: provider.kind,
          status: probe.status,
          checkedAt: now().toISOString(),
          message: probe.message,
          latencyMs: probe.latencyMs,
          probe: probe.probe,
          secretRefs: provider.secretRefs
        };
      }

      return {
        key: provider.key,
        kind: provider.kind,
        status: missingConfig.length > 0 ? "degraded" : "healthy",
        checkedAt: now().toISOString(),
        message:
          missingConfig.length > 0
            ? `Provider 配置不完整：${missingConfig.join("、")}。`
            : "Provider 配置完整，未执行外部敏感数据请求。",
        latencyMs: 0,
        secretRefs: provider.secretRefs
      };
    },
    async deleteProvider({ key, actor }) {
      const persistedProvider = await providerRepository.findByKey(key);
      if (!persistedProvider) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }

      const normalizedProvider = normalizeProviderConfigRecord({
        ...persistedProvider,
        enabled: persistedProvider.status !== "disabled"
      });

      if (normalizedProvider.isMock) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }

      // 不能删除当前默认 Provider
      if (normalizedProvider.isDefault) {
        throw Object.assign(new Error("CANNOT_DELETE_DEFAULT_PROVIDER"), {
          code: "CANNOT_DELETE_DEFAULT_PROVIDER",
          statusCode: 409
        });
      }

      await providerRepository.save({
        key,
        kind: persistedProvider.kind as "ocr" | "llm" | "storage" | "lims",
        displayName: persistedProvider.displayName,
        status: "deleted",
        isDefault: false,
        config: {},
        secretRefs: {},
        updatedById: actor.actorUserId
      });

      return { deleted: true };
    }
  };
}

function createConfiguredLimsWritebackAdapter(env: ProductionEnv) {
  return createLimsWritebackAdapter({
    endpoint: new URL(env.lims.clinicalInfoEndpoint, env.lims.baseUrl).toString(),
    headers: {
      Authorization: `Bearer ${env.lims.apiToken}`
    },
    timeoutMs: env.lims.timeoutMs,
    maxRetries: 1,
    idempotencyKeyHeader: "X-Idempotency-Key",
    responseMapping: {
      statusPath: "status",
      successValue: "success",
      receiptIdPath: "receiptId",
      errorMessagePath: "message",
      retryablePath: "retryable"
    }
  });
}

function createAuditRecorder(auditRepository: ReturnType<typeof createAuditRepository>) {
  return (input: AuditRecordInput) => {
    const payload: Parameters<typeof auditRepository.create>[0] = {
      action: input.action,
      objectType: input.objectType,
      result: input.result,
      metadata: toInputJsonValue(input.metadata)
    };

    if (input.actorUserId !== undefined) {
      payload.actorUserId = input.actorUserId;
    }
    if (input.actorApiTokenId !== undefined) {
      payload.actorApiTokenId = input.actorApiTokenId;
    }
    if (input.objectId !== undefined) {
      payload.objectId = input.objectId;
    }
    if (input.ipAddress !== undefined) {
      payload.ipAddress = input.ipAddress;
    }
    if (input.userAgent !== undefined) {
      payload.userAgent = input.userAgent;
    }

    return auditRepository.create(payload);
  };
}

function isPersistableRecognitionStatus(status: RecognitionRuntimeStatus) {
  return [
    "queued",
    "running",
    "completed",
    "partial_completed",
    "needs_review",
    "writeback_pending",
    "writeback_completed",
    "writeback_failed",
    "failed"
  ].includes(status);
}

function createPrismaJobTransitionRepository(jobsRepository: ReturnType<typeof createJobsRepository>, now: () => Date): JobRepository {
  return {
    async recordTransition(transition) {
      if (!isPersistableRecognitionStatus(transition.status)) {
        return;
      }

      // LangGraph 编排中的状态流转必须落到 RecognitionJob，
      // 否则 production mode 会出现“API 返回完成但数据库仍停留在 queued”的不一致。
      await jobsRepository.updateStatus({
        id: transition.jobId,
        status: transition.status,
        ...(transition.status === "running" ? { startedAt: now() } : {}),
        ...(["completed", "partial_completed", "needs_review", "writeback_completed", "writeback_failed", "failed"].includes(
          transition.status
        )
          ? { completedAt: now() }
          : {}),
        trace: [
          {
            node: "jobTransition",
            status: transition.status,
            message: transition.message
          }
        ]
      });
    }
  };
}

function toEvaluationDocumentInput(sample: EvaluationDatasetSample): OcrDocumentInput {
  const inputRecord = readPayloadRecord(sample.input);
  const documentId = readString(
    inputRecord.documentId,
    readString(inputRecord.fileId, readString(inputRecord.externalId, sample.id))
  );
  const document: OcrDocumentInput = {
    documentId
  };
  const fileName = readOptionalString(inputRecord.fileName);
  const mimeType = readOptionalString(inputRecord.mimeType);
  const storageKey = readOptionalString(inputRecord.storageKey);

  if (fileName !== undefined) {
    document.fileName = fileName;
  }
  if (mimeType !== undefined) {
    document.mimeType = mimeType;
  }
  if (storageKey !== undefined) {
    document.storageKey = storageKey;
  }

  return document;
}

function mapRecognitionResultToEvaluationPrediction(result: JobOrchestratorResult): EvaluationPrediction {
  const validationByField = new Map(result.validation.fieldResults.map((field) => [field.fieldKey, field]));
  const candidates =
    result.validation.normalizedCandidates.length > 0 ? result.validation.normalizedCandidates : result.extraction?.candidates ?? [];

  return Object.fromEntries(
    candidates.map((candidate) => {
      const validation = validationByField.get(candidate.fieldKey);

      return [
        candidate.fieldKey,
        {
          value: candidate.value,
          normalizedValue: candidate.value,
          evidence: candidate.evidence.map((evidence) => evidence.snippet),
          needsReview: validation ? validation.decision !== "accepted" : result.status !== "completed"
        }
      ];
    })
  );
}

function collectEvaluationWarnings(result: JobOrchestratorResult): string[] {
  const warnings = result.trace
    .filter((event) => event.status === "failed" || event.status === "skipped")
    .map((event) => `${event.node}: ${event.message}`);

  if (result.error) {
    warnings.push(result.error.message);
  }

  return warnings;
}

function readEvaluationSchemaSelection(value: unknown) {
  const config = readPayloadRecord(value);
  const selection: {
    schemaKey?: string;
    schemaVersionId?: string;
  } = {};
  const schemaKey = readOptionalString(config.schemaKey);
  const schemaVersionId = readOptionalString(config.schemaVersionId);

  if (schemaKey !== undefined) {
    selection.schemaKey = schemaKey;
  }
  if (schemaVersionId !== undefined) {
    selection.schemaVersionId = schemaVersionId;
  }

  return selection;
}

function withEvaluationSchemaSummary(
  result: Awaited<ReturnType<typeof runEvaluation>>,
  schemaResolution: NonNullable<ProductionSchemaResolution>
): Awaited<ReturnType<typeof runEvaluation>> {
  const schemaMetadata = {
    schemaKey: schemaResolution.schemaKey,
    schemaVersionId: schemaResolution.schemaVersionId ?? null,
    schemaSource: schemaResolution.source
  };

  return {
    ...result,
    summary: {
      ...result.summary,
      ...schemaMetadata
    },
    metrics: {
      ...result.metrics,
      schemaKey: schemaMetadata.schemaKey,
      schemaVersionId: schemaMetadata.schemaVersionId,
      schemaSource: schemaMetadata.schemaSource
    } as typeof result.metrics
  };
}

function createProductionEvaluationRunner(input: {
  jobsRepository: ReturnType<typeof createJobsRepository>;
  resultsRepository: ReturnType<typeof createResultsRepository>;
  schemaRepository: ProductionSchemaRepository;
  recognitionOrchestrator: JobOrchestrator;
  now: () => Date;
}): ApiEvaluationRunner {
  return {
    async run(runInput) {
      const schemaSelection = readEvaluationSchemaSelection(runInput.schemaConfig);
      const schemaResolution = await resolveProductionRecognitionSchema({
        schemaRepository: input.schemaRepository,
        ...schemaSelection
      });

      if (!schemaResolution) {
        const error = Object.assign(new Error("EVALUATION_SCHEMA_CONFIG_NOT_AVAILABLE"), {
          code: "EVALUATION_SCHEMA_CONFIG_NOT_AVAILABLE"
        });
        throw error;
      }

      const result = await runEvaluation({
        dataset: runInput.dataset,
        schemaConfig: {
          schemaKey: schemaResolution.schemaKey,
          schemaVersionId: schemaResolution.schemaVersionId ?? null,
          schemaSource: schemaResolution.source
        },
        providerConfig: runInput.providerConfig,
        now: () => input.now().getTime(),
        recognition: async ({ sample }) => {
          const sampleInput = readPayloadRecord(sample.input);
          const sourceFileId = readOptionalString(sampleInput.fileId);
          const job = await input.jobsRepository.create({
            schemaKey: schemaResolution.schemaKey,
            schemaVersionId: schemaResolution.schemaVersionId ?? null,
            sourceFileId: sourceFileId ?? null,
            createdById: runInput.actor.actorUserId,
            providerConfig: runInput.providerConfig,
            options: toInputJsonValue({
              evaluationRunId: runInput.runId,
              evaluationSampleId: sample.id
            })
          });
          const result = await input.recognitionOrchestrator.start({
            jobId: job.id,
            schemaKey: schemaResolution.schemaKey,
            ...(schemaResolution.schemaVersionId !== undefined ? { schemaVersionId: schemaResolution.schemaVersionId } : {}),
            document: toEvaluationDocumentInput(sample)
          });

          // 评估运行复用正式识别编排，同时为每个样本保留一份 RecognitionResult，
          // 方便后续从评估指标反查具体字段证据和 LangGraph trace。
          await input.resultsRepository.upsertByJobId({
            jobId: job.id,
            fields: toInputJsonValue(result.extraction?.candidates ?? []),
            normalizedFields: toInputJsonValue(result.validation.normalizedCandidates),
            evidence: toInputJsonValue(result.validation.fieldResults),
            payload: toInputJsonValue(result),
            reviewRequired: result.status !== "completed"
          });

          return {
            fields: mapRecognitionResultToEvaluationPrediction(result),
            warnings: collectEvaluationWarnings(result)
          };
        }
      });

      return withEvaluationSchemaSummary(result, schemaResolution);
    }
  };
}

/**
 * 创建生产模式 API services。
 * 把 Prisma repositories、真实 provider factory、Schema service 和 LIMS 写回 adapter 一次性装配起来。
 */
export function createProductionApiServices(options: CreateProductionApiServicesOptions): ApiServerServices {
  const now = options.now ?? (() => new Date());
  const providerHealthFetch = options.providerHealthFetch ?? ((url, init) => fetch(url, init));
  const prisma = options.prisma ?? new PrismaClient();
  const userRepository = createUserRepository(prisma);
  const tokenRepository = createTokenRepository(prisma);
  const auditRepository = createAuditRepository(prisma);
  const schemaRepository = createSchemaRepository(prisma);
  const providerRepository = createProviderRepository(prisma);
  const jobsRepository = createJobsRepository(prisma);
  const resultsRepository = createResultsRepository(prisma);
  const writebackRepository = createWritebackRepository(prisma);
  const knowledgeRepository = createKnowledgeRepository(prisma);
  const storageProvider = options.storageProvider ?? buildStorageProvider(options.env);
  const limsWritebackAdapter = options.limsWritebackAdapter ?? createConfiguredLimsWritebackAdapter(options.env);
  const sessionInvalidationStoreOptions: CreateProductionSessionInvalidationStoreOptions = {
    env: options.sessionEnv ?? process.env,
    now
  };
  if (options.sessionInvalidationRepository !== undefined) {
    sessionInvalidationStoreOptions.repository = options.sessionInvalidationRepository;
  }
  if (options.sessionInvalidationDatabaseDelegate !== undefined) {
    sessionInvalidationStoreOptions.databaseDelegate = options.sessionInvalidationDatabaseDelegate;
  }
  if (options.sessionInvalidationRedisClient !== undefined) {
    sessionInvalidationStoreOptions.redisClient = options.sessionInvalidationRedisClient;
  }
  const sessionInvalidationStore = createProductionSessionInvalidationStore(sessionInvalidationStoreOptions);
  const authServiceOptions: Parameters<typeof createAuthService>[0] = {
    userRepository,
    tokenRepository,
    jwtSigner: createSimpleJwtSigner({
      secret: options.env.jwt.secret,
      expiresIn: options.env.jwt.expiresIn,
      now
    }),
    now
  };
  if (sessionInvalidationStore !== undefined) {
    authServiceOptions.sessionInvalidationStore = sessionInvalidationStore;
  }
  const authService = createAuthService(authServiceOptions);
  const schemaService = createSchemaService({
    repository: schemaRepository,
    validateSchema: validateCoreSchemaDraftInput,
    audit: createAuditRecorder(auditRepository),
    now
  });
  const schemaRouteService = {
    listActive: async (input?: { page?: number; pageSize?: number }) => {
      const result = await schemaRepository.listActive(input);
      return result.items;
    },
    listAll: async (input?: { page?: number; pageSize?: number }) => {
      const result = await schemaRepository.listAll(input);
      return result.items;
    },
    ...schemaService
  };
  const productionWritebackExecutor = createProductionWritebackExecutor(
    options.env,
    writebackRepository,
    limsWritebackAdapter,
    now,
    jobsRepository,
    resultsRepository
  );
  const modelProviderOptions = buildModelProviderOptions(options);
  const createProductionRecognitionOrchestrator = (schema: CoreSchemaDraft, providers: ProductionProviderRuntimeSelection = {}) =>
    createJobOrchestrator({
      repository: createPrismaJobTransitionRepository(jobsRepository, now),
      schema,
      ocrProvider: providers.ocrProvider ?? buildOcrProvider(options.env, modelProviderOptions),
      modelProvider: providers.modelProvider ?? buildModelProvider(options.env, modelProviderOptions),
      knowledgeRetriever: createDatabaseKnowledgeRetriever(knowledgeRepository),
      permissions: Object.values(PERMISSIONS),
      autoWritebackEnabled: true,
      schemaActive: true,
      writebackExecutor: productionWritebackExecutor
    });
  const builtinRecognitionOrchestrator = createProductionRecognitionOrchestrator(
    createProductionRecognitionSchema(limsClinicalInfoSchema)
  );
  const recognitionOrchestrator = createProviderConfigAwareOrchestrator({
    env: options.env,
    schemaRepository,
    providerRepository,
    runtimeOptions: modelProviderOptions,
    builtinOrchestrator: builtinRecognitionOrchestrator,
    createOrchestrator: createProductionRecognitionOrchestrator
  });
  const createProductionEvaluationRecognitionOrchestrator = (
    schema: CoreSchemaDraft,
    providers: ProductionProviderRuntimeSelection = {}
  ) =>
    createJobOrchestrator({
      repository: createPrismaJobTransitionRepository(jobsRepository, now),
      schema,
      ocrProvider: providers.ocrProvider ?? buildOcrProvider(options.env, modelProviderOptions),
      modelProvider:
        providers.modelProvider ??
        buildModelProvider(options.env, modelProviderOptions),
      knowledgeRetriever: createDatabaseKnowledgeRetriever(knowledgeRepository),
      permissions: Object.values(PERMISSIONS),
      autoWritebackEnabled: false,
      schemaActive: true
    });
  const builtinEvaluationRecognitionOrchestrator = createProductionEvaluationRecognitionOrchestrator(limsClinicalInfoSchema);
  const evaluationRecognitionOrchestrator = createProviderConfigAwareOrchestrator({
    env: options.env,
    schemaRepository,
    providerRepository,
    runtimeOptions: modelProviderOptions,
    builtinOrchestrator: builtinEvaluationRecognitionOrchestrator,
    createOrchestrator: createProductionEvaluationRecognitionOrchestrator
  });
  const jobQueueAdapterOptions: CreateProductionJobQueueAdapterOptions = {
    env: options.queueEnv ?? process.env,
    now
  };
  if (options.redisQueueClient !== undefined) {
    jobQueueAdapterOptions.redisClient = options.redisQueueClient;
  }
  const jobQueueExecutor = createProductionJobQueueAdapter(jobQueueAdapterOptions);

  const services = createApiServices({
    authService,
    auditService: {
      listRecent: async (input) => {
        const result = await auditRepository.listRecent(input);
        // 分页模式下返回完整分页信息，否则返回 items 数组
        if (input && input.page !== undefined && input.pageSize !== undefined) {
          return {
            items: result.items,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
          };
        }
        return result.items;
      },
      record: createAuditRecorder(auditRepository)
    },
    schemaService: schemaRouteService,
    repositories: {
      schemaRepository,
      fileRepository: createFileRepository(prisma),
      jobsRepository,
      resultsRepository,
      feedbackRepository: createFeedbackRepository(prisma),
      writebackRepository,
      evaluationRepository: createEvaluationRepository(prisma)
    },
    recognitionOrchestrator,
    providerRegistry: createProviderRegistry(
      options.env,
      storageProvider,
      now,
      providerHealthFetch,
      providerRepository,
      modelProviderOptions.secretResolver
    ),
    evaluationRunner: createProductionEvaluationRunner({
      jobsRepository,
      resultsRepository,
      schemaRepository,
      recognitionOrchestrator: evaluationRecognitionOrchestrator,
      now
    }),
    storageProvider,
    ...(jobQueueExecutor ? { jobQueueExecutor } : {}),
    now
  });

  const statsService = createStatsService(prisma);

  // feedbackService 增强：支持 updateStatus（审核反馈 + 写入知识库）
  const originalFeedbackService = services.feedbackService;

  return {
    ...services,
    knowledgeService: {
      knowledgeRepository
    },
    statsService,
    feedbackService: {
      ...originalFeedbackService,
      async updateStatus(id: string, status: 'approved' | 'rejected', reviewNote?: string) {
        const prismaStatus = status === 'approved' ? 'accepted' : 'rejected';
        const now = new Date();

        // 查找反馈记录
        const feedback = await prisma.feedbackSubmission.findUnique({ where: { id } });
        if (!feedback) {
          throw Object.assign(new Error("FEEDBACK_NOT_FOUND"), {
            code: "FEEDBACK_NOT_FOUND",
            statusCode: 404
          });
        }

        // 更新反馈状态
        const updated = await prisma.feedbackSubmission.update({
          where: { id },
          data: { status: prismaStatus, reviewedAt: now }
        });

        // 如果审核通过，写入知识库
        if (status === 'approved' && feedback.fieldKey) {
          const originalStr = feedback.originalValue
            ? (typeof feedback.originalValue === 'string' ? feedback.originalValue : JSON.stringify(feedback.originalValue))
            : '';
          const correctedStr = feedback.correctedValue
            ? (typeof feedback.correctedValue === 'string' ? feedback.correctedValue : JSON.stringify(feedback.correctedValue))
            : '';

          if (correctedStr) {
            try {
              await knowledgeRepository.create({
                kind: 'field_description',
                title: `纠偏: ${feedback.fieldKey}`,
                content: `字段 "${feedback.fieldKey}" 从 "${originalStr}" 纠正为 "${correctedStr}"${reviewNote ? `，审核备注: ${reviewNote}` : (feedback.comment ? `，原因: ${feedback.comment}` : '')}`,
                keywords: [feedback.fieldKey],
                fieldKeys: [feedback.fieldKey],
                enabled: true,
                sortOrder: 0
              });
            } catch {
              // 知识库写入失败不影响反馈审核结果
            }
          }
        }

        return updated;
      }
    },
    writebackService: {
      async execute(input) {
        return assertRouteResponseObject(await productionWritebackExecutor(input), "WRITEBACK_RESPONSE_INVALID");
      },
      listEligible: (input) => services.writebackService.listEligible(input),
      listHistory: (input) => services.writebackService.listHistory(input)
    }
  };
}

export function createProductionWritebackExecutor(
  env: ProductionEnv,
  repository = createWritebackRepository(new PrismaClient()),
  adapter = createConfiguredLimsWritebackAdapter(env),
  now: () => Date = () => new Date(),
  jobsRepository?: ReturnType<typeof createJobsRepository>,
  resultsRepository?: ReturnType<typeof createResultsRepository>
) {
  return async (input: unknown) => {
    const body = readPayloadRecord(input);
    const jobId = readString(body.jobId, "unknown-job");
    let readyFields: ReturnType<typeof readReadyFields> = [];

    if (body.confirmed === true) {
      if (!jobsRepository || !resultsRepository) {
        throw createProductionWritebackError("WRITEBACK_SERVER_REPOSITORIES_NOT_CONFIGURED", 500);
      }

      const [job, result] = await Promise.all([
        jobsRepository.findById(jobId),
        resultsRepository.findByJobId(jobId)
      ]);
      readyFields = readReadyFieldsFromRecognitionResult(result);

      if (!isServerReadyWritebackJob(job, result, readyFields)) {
        throw createProductionWritebackError("WRITEBACK_NOT_READY", 409);
      }

      const attempts = await repository.listByJobId(jobId);
      if (attempts.some(isBlockingProductionWritebackAttempt)) {
        throw createProductionWritebackError("WRITEBACK_ALREADY_RUNNING_OR_COMPLETED", 409);
      }
    } else if (body.source === "server-workflow") {
      readyFields = readReadyFields(body.fields);
    } else {
      throw createProductionWritebackError("WRITEBACK_REQUIRES_SERVER_WORKFLOW_SOURCE", 403);
    }

    if (readyFields.length === 0) {
      throw createProductionWritebackError("WRITEBACK_NOT_READY", 409);
    }

    const payload = buildGenericJsonPayload(readyFields);
    const fields = readyFields.map((field) => ({
      sourceFieldKey: field.fieldKey,
      targetFieldKey: field.targetPath,
      value: field.value
    }));
    const idempotencyKey = readString(body.idempotencyKey, `${jobId}:${now().toISOString()}`);
    const attempt = await repository.create({
      jobId,
      targetSystem: "lims",
      endpoint: new URL(env.lims.clinicalInfoEndpoint, env.lims.baseUrl).toString(),
      idempotencyKey,
      requestPayload: toInputJsonValue(payload)
    });
    const result = await adapter.execute({
      id: attempt.id,
      recognitionResultId: jobId,
      limsSampleId: readString(body.limsSampleId, jobId),
      requestedByUserId: readRequestedByUserId(body),
      requestedAt: now().toISOString(),
      fields,
      payload,
      idempotencyKey
    });

    const completeInput: Parameters<typeof repository.complete>[1] = {
      status: result.status === "success" ? "succeeded" : "failed",
      retryable: result.retryable,
      completedAt: now()
    };

    if (result.status === "success") {
      completeInput.responsePayload = toInputJsonValue(result);
    } else {
      completeInput.error = toInputJsonValue(result);
    }

    await repository.complete(attempt.id, completeInput);

    if (result.status === "success") {
      const executionResult: WritebackExecutionResult = {
        status: "success" as const,
        retryable: result.retryable
      };
      if (result.externalReceiptId !== undefined) {
        executionResult.receiptId = result.externalReceiptId;
      }

      return executionResult;
    }

    const executionResult: WritebackExecutionResult = {
      status: "failed" as const,
      retryable: result.retryable
    };
    if (result.errorMessage !== undefined) {
      executionResult.errorMessage = result.errorMessage;
    }

    return executionResult;
  };
}

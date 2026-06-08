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

import { createAuthService } from "../auth/auth.service";
import { PERMISSIONS } from "../auth/permissions";
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
import { createApiServices, type ApiEvaluationRunner, type ProviderRegistry } from "../services/api-services";
import { createSchemaService } from "../services/schema.service";
import type { ApiServerServices } from "../server";
import {
  createLocalStorageProvider,
  createS3Client,
  createS3StorageProvider,
  type StorageProvider
} from "../storage";

type ProductionEnv = Pick<AppEnv, "jwt" | "storage" | "providers" | "lims">;
type ProviderHealthFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText">>;
type ProductionProviderRepository = ReturnType<typeof createProviderRepository>;
type ProviderKindValue = "ocr" | "llm" | "storage" | "lims";
type ProviderRegistryItem = {
  key: string;
  kind: ProviderKindValue;
  name: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  status?: unknown;
};

export interface CreateProductionApiServicesOptions {
  env: ProductionEnv;
  prisma?: PrismaClient;
  limsWritebackAdapter?: LimsWritebackAdapter;
  storageProvider?: StorageProvider;
  providerHealthFetch?: ProviderHealthFetch;
  langChainModel?: LangChainModelLike;
  openAiResponsesClient?: OpenAiResponsesClientLike;
  now?: () => Date;
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

  // Mock LLM 候选主要用于演示和自动化测试；这里做最小结构校验，避免保存的脏 JSON 直接进入抽取结果。
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

  // Mock OCR blocks 同样来自在线配置，必须至少具备页码、块 ID 和文本，后续坐标等字段由核心 provider 自己兜底。
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

function buildOcrProvider(env: ProductionEnv) {
  if (env.providers.ocr.provider === "http") {
    return createOcrProvider({
      kind: "http",
      http: {
        endpoint: env.providers.ocr.endpoint ?? "",
        headers: env.providers.ocr.apiKey ? { Authorization: `Bearer ${env.providers.ocr.apiKey}` } : {},
        timeoutMs: 30_000
      }
    });
  }

  return createOcrProvider({
    kind: "mock"
  });
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
        timeoutMs: 30_000
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

  return createModelProvider({
    kind: "mock"
  });
}

function buildModelProviderOptions(options: CreateProductionApiServicesOptions) {
  const modelProviderOptions: {
    langChainModel?: LangChainModelLike;
    openAiResponsesClient?: OpenAiResponsesClientLike;
  } = {};

  if (options.langChainModel) {
    modelProviderOptions.langChainModel = options.langChainModel;
  }

  if (options.openAiResponsesClient) {
    modelProviderOptions.openAiResponsesClient = options.openAiResponsesClient;
  }

  return modelProviderOptions;
}

type ProviderRuntimeOptions = {
  langChainModel?: LangChainModelLike;
  openAiResponsesClient?: OpenAiResponsesClientLike;
};

function readSavedProviderMode(config: Record<string, unknown>) {
  return readString(config.providerKind, readString(config.provider, readString(config.kind, "Mock"))).toLowerCase();
}

function buildSavedOcrProvider(input: {
  key: string;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
}): OcrProvider | null {
  const mode = readSavedProviderMode(input.config);

  // 保存的 Mock provider 是 demo 和评估回放的核心能力，可在不接真实外部服务时验证整条 Agent 流程。
  if (mode === "mock") {
    const mockConfig: Parameters<typeof createOcrProvider>[0] = {
      kind: "mock",
      mock: {
        providerName: input.key
      }
    };
    const blocks = readOcrBlocks(input.config.blocks);
    if (blocks) {
      mockConfig.mock = {
        ...mockConfig.mock,
        blocks
      };
    }

    return createOcrProvider(mockConfig);
  }

  // HTTP OCR provider 只在 endpoint 完整时实例化；缺配置返回 null，由上层转成显式 provider 不可用结果。
  if (mode === "http" || mode === "openai-compatible") {
    const endpoint = readOptionalString(input.config.endpoint);
    if (!endpoint) {
      return null;
    }

    return createOcrProvider({
      kind: "http",
      http: {
        providerName: input.key,
        endpoint,
        headers: readStringRecord(input.config.headers),
        timeoutMs: readNumber(input.config.timeoutMs, 30_000)
      }
    });
  }

  return null;
}

function buildSavedModelProvider(input: {
  key: string;
  config: Record<string, unknown>;
  secretRefs: Record<string, unknown>;
  runtimeOptions: ProviderRuntimeOptions;
}): ModelProvider | null {
  const mode = readSavedProviderMode(input.config);
  const model = readString(input.config.modelOrBucket, readString(input.config.model, "mock-medical-record-extractor"));

  // Mock LLM 允许测试 demo 页面保存后的配置能真实驱动抽取候选，而不是静默回退到 env 默认模型。
  if (mode === "mock") {
    const mockConfig: {
      providerName: string;
      candidates?: ModelFieldCandidate[];
    } = {
      providerName: input.key
    };
    const candidates = readModelCandidates(input.config.candidates);
    if (candidates) {
      mockConfig.candidates = candidates;
    }

    return createModelProvider({
      kind: "mock",
      mock: mockConfig
    });
  }

  // 在线保存的 HTTP / OpenAI-compatible 配置当前只从非敏感 JSON 字段读取 endpoint、model 和 headers。
  // 密钥引用 secretRefs 暂不直接解密，后续接入生产密钥库时在这里补齐 Authorization。
  if (mode === "http" || mode === "openai-compatible") {
    const endpoint = readOptionalString(input.config.endpoint);
    if (!endpoint) {
      return null;
    }

    return createModelProvider({
      kind: "http",
      http: {
        providerName: input.key,
        endpoint,
        model,
        headers: readStringRecord(input.config.headers),
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
  return env.providers.ocr.provider === "http" ? "http-ocr" : "mock-ocr";
}

function getConfiguredModelProviderKey(env: ProductionEnv) {
  return env.providers.llm.provider === "openai-compatible" ? "openai-compatible-model" : `${env.providers.llm.provider}-model`;
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
};

type ProductionSchemaRepository = Pick<ReturnType<typeof createSchemaRepository>, "findActiveVersionBySchemaKey">;

type ProductionSchemaResolution =
  | {
      schema: CoreSchemaDraft;
      source: "database" | "builtin";
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
  schemaRepository: ProductionSchemaRepository;
}): Promise<ProductionSchemaResolution> {
  const schemaKey = input.schemaKey ?? limsClinicalInfoSchema.key;
  const activeSchemaVersion = await input.schemaRepository.findActiveVersionBySchemaKey(schemaKey);

  if (activeSchemaVersion) {
    // 数据库 active schema 是生产识别的运行时契约：字段列表会约束抽取，
    // adapterHints.limsTargetPath 会继续进入 writebackAgent 并决定最终写回 payload。
    // 因此这里必须先复用 core schema 校验，避免损坏的线上定义进入真实识别链路。
    if (!isUsableCoreSchemaDraft(activeSchemaVersion.definition)) {
      return null;
    }

    return {
      schema: activeSchemaVersion.definition,
      source: "database"
    };
  }

  if (schemaKey === limsClinicalInfoSchema.key) {
    // 内置 LIMS 临床信息 schema 只作为兼容回退：数据库没有 active 版本时继续保持旧部署可用；
    // 未知 custom schema 不走这个分支，避免把用户选择的 schema 静默替换成默认字段映射。
    return {
      schema: limsClinicalInfoSchema,
      source: "builtin"
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
      secretRefs
    });
  }

  return buildSavedModelProvider({
    key: provider.key,
    config,
    secretRefs,
    runtimeOptions: input.runtimeOptions
  });
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
  const providers: ProductionProviderRuntimeSelection = {};

  // 调用方选择 env 默认 key 时无需重新实例化；只有选择在线保存的非默认 key 时才读取数据库配置。
  if (ocrProviderKey !== undefined && ocrProviderKey !== getConfiguredOcrProviderKey(input.env)) {
    const provider = await resolveSavedProviderRuntime({
      key: ocrProviderKey,
      expectedKind: "ocr",
      providerRepository: input.providerRepository,
      runtimeOptions: input.runtimeOptions
    });
    if (!provider) {
      return { available: false };
    }
    providers.ocrProvider = provider as OcrProvider;
  }

  if (modelProviderKey !== undefined && modelProviderKey !== getConfiguredModelProviderKey(input.env)) {
    const provider = await resolveSavedProviderRuntime({
      key: modelProviderKey,
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
  const method = "HEAD";
  const requestInit: RequestInit = {
    method
  };

  if (input.apiKey) {
    requestInit.headers = {
      Authorization: `Bearer ${input.apiKey}`
    };
  }

  try {
    // OCR 健康检查只做 HEAD 最小探针，不发送病历文本、文件内容或识别 payload。
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

  return {
    key,
    kind,
    name: displayName,
    displayName,
    enabled: typeof provider.enabled === "boolean" ? provider.enabled : provider.status !== "disabled",
    isDefault: provider.isDefault === true,
    config: isInputJsonObject(provider.config) ? provider.config : {},
    secretRefs: isInputJsonObject(provider.secretRefs) ? provider.secretRefs : {},
    status: provider.status
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
  providerRepository: ProductionProviderRepository
): ProviderRegistry {
  const environmentProviders = [
    {
      key: env.providers.ocr.provider === "http" ? "http-ocr" : "mock-ocr",
      kind: "ocr",
      displayName: env.providers.ocr.provider === "http" ? "HTTP OCR Provider" : "Mock OCR Provider",
      enabled: true,
      isDefault: true,
      config: {
        endpoint: env.providers.ocr.endpoint ?? null
      },
      secretRefs: env.providers.ocr.apiKey ? { apiKey: "configured" } : {}
    },
    {
      key: env.providers.llm.provider === "openai-compatible" ? "openai-compatible-model" : `${env.providers.llm.provider}-model`,
      kind: "llm",
      displayName: `${env.providers.llm.provider} Model Provider`,
      enabled: true,
      isDefault: true,
      config: {
        model: env.providers.llm.model,
        baseUrl: env.providers.llm.baseUrl ?? null
      },
      secretRefs: env.providers.llm.apiKey || env.providers.llm.openAiApiKey ? { apiKey: "configured" } : {}
    },
    {
      key: "lims-writeback",
      kind: "lims",
      displayName: "LIMS Writeback Adapter",
      enabled: true,
      isDefault: true,
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
      const providersByKey = new Map<string, Record<string, unknown>>();
      for (const provider of environmentProviders) {
        providersByKey.set(provider.key, normalizeProviderConfigRecord(provider));
      }
      for (const provider of await providerRepository.list()) {
        providersByKey.set(
          provider.key,
          normalizeProviderConfigRecord({
            ...provider,
            enabled: provider.status !== "disabled"
          })
        );
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
      const persistedProvider = await providerRepository.setDefault(key);
      if (persistedProvider) {
        return normalizeProviderConfigRecord({
          ...persistedProvider,
          enabled: persistedProvider.status !== "disabled"
        });
      }

      const provider = environmentProviders.find((item) => item.key === key);
      if (!provider) {
        throw Object.assign(new Error("PROVIDER_NOT_FOUND"), {
          code: "PROVIDER_NOT_FOUND",
          statusCode: 404
        });
      }

      return {
        ...provider,
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

function createProductionEvaluationRunner(input: {
  jobsRepository: ReturnType<typeof createJobsRepository>;
  resultsRepository: ReturnType<typeof createResultsRepository>;
  recognitionOrchestrator: JobOrchestrator;
  now: () => Date;
}): ApiEvaluationRunner {
  return {
    run(runInput) {
      return runEvaluation({
        dataset: runInput.dataset,
        schemaConfig: limsClinicalInfoSchema,
        providerConfig: runInput.providerConfig,
        now: () => input.now().getTime(),
        recognition: async ({ sample }) => {
          const sampleInput = readPayloadRecord(sample.input);
          const sourceFileId = readOptionalString(sampleInput.fileId);
          const job = await input.jobsRepository.create({
            schemaKey: limsClinicalInfoSchema.key,
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
    }
  };
}

/**
 * 创建生产模式 API services。
 * 默认 `pnpm dev:api` 仍可使用 demo services；设置 API_SERVICE_MODE=production 后会走这里，
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
  const storageProvider = options.storageProvider ?? buildStorageProvider(options.env);
  const limsWritebackAdapter = options.limsWritebackAdapter ?? createConfiguredLimsWritebackAdapter(options.env);
  const authService = createAuthService({
    userRepository,
    tokenRepository,
    jwtSigner: createSimpleJwtSigner({
      secret: options.env.jwt.secret,
      expiresIn: options.env.jwt.expiresIn,
      now
    }),
    now
  });
  const schemaService = createSchemaService({
    repository: schemaRepository,
    validateSchema: validateCoreSchemaDraftInput,
    audit: createAuditRecorder(auditRepository),
    now
  });
  const schemaRouteService = {
    listActive: () => schemaRepository.listActive(),
    ...schemaService
  };
  const productionWritebackExecutor = createProductionWritebackExecutor(options.env, writebackRepository, limsWritebackAdapter, now);
  const modelProviderOptions = buildModelProviderOptions(options);
  const createProductionRecognitionOrchestrator = (schema: CoreSchemaDraft, providers: ProductionProviderRuntimeSelection = {}) =>
    createJobOrchestrator({
      repository: createPrismaJobTransitionRepository(jobsRepository, now),
      schema,
      ocrProvider: providers.ocrProvider ?? buildOcrProvider(options.env),
      modelProvider: providers.modelProvider ?? buildModelProvider(options.env, modelProviderOptions),
      knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
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
  const evaluationRecognitionOrchestrator = createJobOrchestrator({
    repository: createPrismaJobTransitionRepository(jobsRepository, now),
    schema: limsClinicalInfoSchema,
    ocrProvider: buildOcrProvider(options.env),
    modelProvider: buildModelProvider(options.env, modelProviderOptions),
    knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
    permissions: Object.values(PERMISSIONS),
    autoWritebackEnabled: false,
    schemaActive: true
  });

  const services = createApiServices({
    authService,
    auditService: {
      listRecent: auditRepository.listRecent,
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
    providerRegistry: createProviderRegistry(options.env, storageProvider, now, providerHealthFetch, providerRepository),
    evaluationRunner: createProductionEvaluationRunner({
      jobsRepository,
      resultsRepository,
      recognitionOrchestrator: evaluationRecognitionOrchestrator,
      now
    }),
    storageProvider,
    now
  });

  return {
    ...services,
    writebackService: {
      execute: productionWritebackExecutor,
      listEligible: (input) => services.writebackService.listEligible(input)
    }
  };
}

export function createProductionWritebackExecutor(
  env: ProductionEnv,
  repository = createWritebackRepository(new PrismaClient()),
  adapter = createConfiguredLimsWritebackAdapter(env),
  now: () => Date = () => new Date()
) {
  return async (input: unknown) => {
    const body = readPayloadRecord(input);
    const jobId = readString(body.jobId, "unknown-job");
    const readyFields = readReadyFields(body.fields);
    const payload = readyFields.length > 0 ? buildGenericJsonPayload(readyFields) : readPayloadRecord(body.payload);
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
      requestedByUserId: readString(body.requestedByUserId, "system"),
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

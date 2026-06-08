import { PrismaClient, type Prisma } from "@prisma/client";
import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createLimsWritebackAdapter,
  createModelProvider,
  createOcrProvider,
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
  type OcrDocumentInput,
  type LimsWritebackAdapter,
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

export interface CreateProductionApiServicesOptions {
  env: ProductionEnv;
  prisma?: PrismaClient;
  limsWritebackAdapter?: LimsWritebackAdapter;
  storageProvider?: StorageProvider;
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

function readPayloadRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

function buildModelProvider(env: ProductionEnv) {
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
    return createModelProvider({
      kind: "langchain",
      langchain: {
        providerName: "langchain-configured-model",
        model: {
          async invoke() {
            // 生产 LangChain 模型需要在部署层注入真实 ChatModel。
            // 这里返回空候选让配置未完成时保持可诊断失败，而不是把病历文本发往未知目标。
            return {
              candidates: []
            };
          }
        }
      }
    });
  }

  if (env.providers.llm.provider === "openai-responses") {
    return createModelProvider({
      kind: "openai-responses",
      openAiResponses: {
        model: env.providers.llm.model,
        experimental: {
          enabled: true
        },
        client: {
          responses: {
            async create() {
              throw new Error("OPENAI_RESPONSES_CLIENT_NOT_INJECTED");
            }
          }
        }
      }
    });
  }

  return createModelProvider({
    kind: "mock"
  });
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

function createProviderRegistry(env: ProductionEnv): ProviderRegistry {
  const providers = [
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
    }
  ];

  return {
    async list() {
      // Provider 列表只暴露配置状态，不返回密钥、token 或 header 原文。
      return providers;
    },
    async setDefault(key) {
      const provider = providers.find((item) => item.key === key);
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
  const prisma = options.prisma ?? new PrismaClient();
  const userRepository = createUserRepository(prisma);
  const tokenRepository = createTokenRepository(prisma);
  const auditRepository = createAuditRepository(prisma);
  const schemaRepository = createSchemaRepository(prisma);
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
  const productionRecognitionSchema = createProductionRecognitionSchema(limsClinicalInfoSchema);
  const productionWritebackExecutor = createProductionWritebackExecutor(options.env, writebackRepository, limsWritebackAdapter, now);
  const recognitionOrchestrator = createJobOrchestrator({
    repository: createPrismaJobTransitionRepository(jobsRepository, now),
    schema: productionRecognitionSchema,
    ocrProvider: buildOcrProvider(options.env),
    modelProvider: buildModelProvider(options.env),
    knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
    permissions: Object.values(PERMISSIONS),
    autoWritebackEnabled: true,
    schemaActive: true,
    writebackExecutor: productionWritebackExecutor
  });
  const evaluationRecognitionOrchestrator = createJobOrchestrator({
    repository: createPrismaJobTransitionRepository(jobsRepository, now),
    schema: limsClinicalInfoSchema,
    ocrProvider: buildOcrProvider(options.env),
    modelProvider: buildModelProvider(options.env),
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
    providerRegistry: createProviderRegistry(options.env),
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
      execute: productionWritebackExecutor
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

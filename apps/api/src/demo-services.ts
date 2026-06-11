import { UserStatus } from "@prisma/client";
import {
  createDefaultMedicalKnowledgeBase,
  createInMemoryJobRepository,
  createInMemoryKnowledgeRetriever,
  createJobOrchestrator,
  createMockModelProvider,
  createMockOcrProvider,
  createModelProvider,
  createOcrProvider,
  limsClinicalInfoSchema,
  type JobOrchestratorResult,
  type JobStatusTransition
} from "@medical-record-agent/core";

import { PERMISSIONS } from "./auth/permissions";
import { createInMemorySessionInvalidationStore } from "./auth/auth.service";
import type { AuthContext } from "./middleware/auth.middleware";
import type { ApiServerServices } from "./server";

const demoPermissions = Object.values(PERMISSIONS);

function createDemoAuthContext(authType: AuthContext["authType"], actorApiTokenId?: string): AuthContext {
  const context: AuthContext = {
    actorUserId: "demo-user",
    authType,
    permissions: demoPermissions,
    roles: ["demo-admin"]
  };

  if (actorApiTokenId !== undefined) {
    context.actorApiTokenId = actorApiTokenId;
  }

  return context;
}

export interface DemoApiServices extends ApiServerServices {
  internalTestRecognitionService: {
    createWithSyntheticProviders(input: unknown): ReturnType<ApiServerServices["jobService"]["create"]>;
  };
}

/**
 * 创建本地开发用的完整 API 依赖集合。
 * 这里不连接真实数据库或外部 provider，只让 `pnpm dev:api` 能启动完整路由，方便前端 demo 和 API smoke test。
 */
export function createDemoApiServices(): DemoApiServices {
  const sessionInvalidationStore = createInMemorySessionInvalidationStore();
  const jobs = new Map<string, { id: string; status: string; schemaKey: string; sourceFileId?: string }>();
  const results = new Map<string, JobOrchestratorResult>();
  const evaluationDatasets = new Map<
    string,
    {
      id: string;
      key: string;
      displayName: string;
      description?: string;
      deidentified: boolean;
      metadata?: unknown;
    }
  >();
  const evaluationSamples = new Map<string, Array<{ id: string; externalId?: string; groundTruth: unknown; metadata?: unknown }>>();
  const evaluationRuns = new Map<string, { id: string; datasetId: string; providerKey?: string; status: string }>();
  const evaluationMetrics = new Map<string, Array<{ name: string; value: number; unit: string }>>();
  const demoProviders = new Map<
    string,
    {
      key: string;
      name: string;
      displayName: string;
      kind: "ocr" | "llm" | "storage" | "lims";
      enabled: boolean;
      isDefault: boolean;
      isMock: boolean;
      status?: string;
      config: Record<string, unknown>;
      secretRefs: Record<string, unknown>;
    }
  >();
  const demoSchemaDefinition = {
    key: "lims-clinical-info",
    label: "LIMS 临床信息弹窗字段",
    fields: [
      {
        key: "clinicalDiagnosis",
        label: "临床诊断",
        type: "text"
      },
      {
        key: "sampleType",
        label: "样本类型",
        type: "text"
      }
    ],
    evidencePolicy: {
      minConfidence: 0.85
    }
  };
  const schemaDrafts = new Map<
    string,
    {
      id: string;
      schemaKey: string;
      displayName: string;
      definition: unknown;
      status: string;
      validationReport?: unknown;
      publishedVersionId?: string;
    }
  >();
  const schemaVersions = new Map<
    string,
    {
      id: string;
      schemaKey: string;
      version: number;
      displayName: string;
      definition: unknown;
      status: string;
      changelog: string;
    }
  >();

  schemaVersions.set("schema-version-demo-001", {
    id: "schema-version-demo-001",
    schemaKey: "lims-clinical-info",
    version: 1,
    displayName: "LIMS 临床信息弹窗字段",
    definition: demoSchemaDefinition,
    status: "active",
    changelog: "演示环境初始版本"
  });
  evaluationDatasets.set("dataset-demo-001", {
    id: "dataset-demo-001",
    key: "demo-deidentified-clinical",
    displayName: "脱敏病历识别评估集",
    description: "本地 demo 合成评估集",
    deidentified: true,
    metadata: {
      sourceType: "synthetic"
    }
  });
  evaluationSamples.set("dataset-demo-001", [
    {
      id: "sample-demo-001",
      externalId: "synthetic-demo-001",
      groundTruth: [
        {
          fieldKey: "clinicalDiagnosis",
          value: "肺腺癌"
        }
      ],
      metadata: {
        sourceType: "synthetic",
        deidentified: true
      }
    }
  ]);
  evaluationRuns.set("run-demo-001", {
    id: "run-demo-001",
    datasetId: "dataset-demo-001",
    providerKey: "mock",
    status: "completed"
  });
  evaluationMetrics.set("run-demo-001", [
    {
      name: "field_accuracy",
      value: 0.91,
      unit: "ratio"
    },
    {
      name: "evidence_coverage",
      value: 0.86,
      unit: "ratio"
    }
  ]);
  demoProviders.set("local-storage", {
    key: "local-storage",
    name: "Local Storage Provider",
    displayName: "Local Storage Provider",
    kind: "storage",
    enabled: true,
    isDefault: true,
    isMock: false,
    config: {
      driver: "local"
    },
    secretRefs: {}
  });
  demoProviders.set("lims-writeback", {
    key: "lims-writeback",
    name: "LIMS Writeback Adapter",
    displayName: "LIMS Writeback Adapter",
    kind: "lims",
    enabled: true,
    isDefault: true,
    isMock: false,
    config: {
      endpoint: "http://localhost:8090/api/clinical-info/writeback"
    },
    secretRefs: {
      apiToken: "demo-secret"
    }
  });
  demoProviders.set("paddle-ocr", {
    key: "paddle-ocr",
    name: "PaddleOCR 本地服务",
    displayName: "PaddleOCR 本地服务",
    kind: "ocr",
    enabled: true,
    isDefault: true,
    isMock: false,
    config: {
      endpoint: "http://localhost:8866",
      mode: "http-ocr"
    },
    secretRefs: {}
  });
  demoProviders.set("gpt5-llm", {
    key: "gpt5-llm",
    name: "GPT-5.5 (110.42.215.22)",
    displayName: "GPT-5.5 (110.42.215.22)",
    kind: "llm",
    enabled: true,
    isDefault: true,
    isMock: false,
    config: {
      endpoint: "http://110.42.215.22/v1",
      model: "gpt-5.5",
      mode: "openai-compatible"
    },
    secretRefs: {
      apiKey: "sk-433682dc026db1b850cb6f9aadd8708d0474d42e00938a1e7be03c3077982238"
    }
  });

  // Generic key aliases for frontend contract compatibility
  // Frontend uses configured-*-provider keys for user-configured providers
  const ocrProvider = demoProviders.get("paddle-ocr")!;
  demoProviders.set("configured-ocr-provider", { ...ocrProvider, key: "configured-ocr-provider" });
  const llmProvider = demoProviders.get("gpt5-llm")!;
  demoProviders.set("configured-llm-provider", { ...llmProvider, key: "configured-llm-provider" });
  const storageProvider = demoProviders.get("local-storage")!;
  demoProviders.set("configured-storage-provider", { ...storageProvider, key: "configured-storage-provider" });

  function createDemoError(code: string, statusCode: number) {
    return Object.assign(new Error(code), {
      code,
      statusCode
    });
  }

  function createRealProviderNotConfiguredError() {
    return Object.assign(new Error("REAL_PROVIDER_NOT_CONFIGURED"), {
      code: "REAL_PROVIDER_NOT_CONFIGURED",
      statusCode: 503,
      message: "请先配置真实 OCR/LLM Provider；等待接入真实模型提供商。"
    });
  }

  function readSavedProviderMode(config: unknown) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return "";
    }

    const record = config as Record<string, unknown>;
    const mode = record.providerKind ?? record.provider ?? record.kind ?? record.mode;
    return typeof mode === "string" ? mode.toLowerCase() : "";
  }

  // 使用真实 OCR 和 LLM Provider（不再使用 mock）
  const realOcrProvider = createOcrProvider({
    kind: "http",
    http: {
      endpoint: "http://localhost:9001",
      headers: {},
      timeoutMs: 30_000
    }
  });

  const realModelProvider = createModelProvider({
    kind: "http",
    http: {
      endpoint: "http://110.42.215.22/v1",
      model: "gpt-5.5",
      apiKey: "tp-c0yx2mg2aaix6cfirip572fmfxtrv2issmnwoxu71t2hgp2j",
      timeoutMs: 30_000
    }
  });

  const demoJobRepository = createInMemoryJobRepository();
  const demoRecognitionOrchestrator = createJobOrchestrator({
    repository: demoJobRepository,
    schema: limsClinicalInfoSchema,
    ocrProvider: realOcrProvider,
    modelProvider: realModelProvider,
    knowledgeRetriever: createInMemoryKnowledgeRetriever(createDefaultMedicalKnowledgeBase()),
    permissions: demoPermissions,
    autoWritebackEnabled: false,
    schemaActive: true
  });

  function toDemoTrace(jobId: string): JobStatusTransition[] {
    return demoJobRepository.getTransitions(jobId);
  }

  function validateDemoSchema(definition: unknown) {
    // demo 只检查最小可用结构，避免把本地开发服务变成生产校验器。
    const input = definition as { fields?: unknown };
    const valid = Boolean(definition && typeof definition === "object" && Array.isArray(input.fields) && input.fields.length > 0);

    return {
      valid,
      errors: valid
        ? []
        : [
            {
              code: "INVALID_FIELDS",
              path: "fields",
              message: "演示 schema 至少需要一个字段。"
            }
          ]
    };
  }

  return {
    authService: {
      async login() {
        return {
          accessToken: "demo.jwt.token",
          tokenType: "Bearer",
          user: {
            id: "demo-user",
            email: "demo@example.local",
            displayName: "演示用户",
            status: UserStatus.active
          },
          permissions: demoPermissions,
          roles: ["demo-admin"]
        };
      },
      async authenticateJwt() {
        return createDemoAuthContext("jwt");
      },
      async authenticateApiToken() {
        return createDemoAuthContext("api-token", "demo-api-token");
      },
      async invalidateSessionToken(token) {
        await sessionInvalidationStore.invalidate(token);
      },
      isSessionTokenInvalidated(token) {
        return sessionInvalidationStore.isInvalidated(token);
      },
      describeSessionInvalidationStore() {
        return sessionInvalidationStore.describe();
      },
      requirePermission(context, permission) {
        if (!context) {
          throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
        }

        if (!context.permissions.includes(permission)) {
          throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
        }
      }
    },
    auditService: {
      async listRecent() {
        return [
          {
            id: "audit-demo-001",
            action: "api.demo",
            result: "success"
          }
        ];
      },
      async record() {
        return undefined;
      }
    },
    schemaService: {
      async listActive() {
        return Array.from(schemaVersions.values()).filter((schemaVersion) => schemaVersion.status === "active");
      },
      async createDraft(input) {
        const draft = {
          id: `schema-draft-demo-${schemaDrafts.size + 1}`,
          schemaKey: input.schemaKey,
          displayName: input.displayName,
          definition: input.definition,
          status: "draft",
          validationReport: {}
        };
        schemaDrafts.set(draft.id, draft);

        return draft;
      },
      async updateDraft(input) {
        const draft = schemaDrafts.get(input.id);
        if (!draft) {
          throw createDemoError("SCHEMA_DRAFT_NOT_FOUND", 404);
        }

        const updated = {
          ...draft,
          definition: input.definition,
          status: "draft",
          validationReport: {}
        };
        schemaDrafts.set(input.id, updated);

        return updated;
      },
      async validateDraft(input) {
        const draft = schemaDrafts.get(input.id);
        if (!draft) {
          throw createDemoError("SCHEMA_DRAFT_NOT_FOUND", 404);
        }

        const validation = validateDemoSchema(input.definition);
        schemaDrafts.set(input.id, {
          ...draft,
          definition: input.definition,
          status: validation.valid ? "ready" : "invalid",
          validationReport: validation
        });

        return validation;
      },
      async publishDraft(input) {
        const draft = schemaDrafts.get(input.id);
        if (!draft) {
          throw createDemoError("SCHEMA_DRAFT_NOT_FOUND", 404);
        }

        const validation = validateDemoSchema(draft.definition);
        if (!validation.valid || draft.status !== "ready") {
          throw createDemoError("SCHEMA_DRAFT_INVALID", 409);
        }

        for (const version of schemaVersions.values()) {
          if (version.schemaKey === draft.schemaKey && version.status === "active") {
            schemaVersions.set(version.id, {
              ...version,
              status: "inactive"
            });
          }
        }

        const existingVersions = Array.from(schemaVersions.values()).filter((version) => version.schemaKey === draft.schemaKey);
        const nextVersion = Math.max(0, ...existingVersions.map((version) => version.version)) + 1;
        const publishedVersion = {
          id: `schema-version-demo-${nextVersion.toString().padStart(3, "0")}`,
          schemaKey: draft.schemaKey,
          version: nextVersion,
          displayName: draft.displayName,
          definition: draft.definition,
          status: "active",
          changelog: input.changelog
        };
        schemaVersions.set(publishedVersion.id, publishedVersion);
        schemaDrafts.set(input.id, {
          ...draft,
          status: "published",
          publishedVersionId: publishedVersion.id
        });

        return publishedVersion;
      },
      async deactivateVersion(input) {
        const version = schemaVersions.get(input.id);
        if (!version) {
          throw createDemoError("SCHEMA_VERSION_NOT_FOUND", 404);
        }

        const deactivated = {
          ...version,
          status: "inactive"
        };
        schemaVersions.set(input.id, deactivated);

        return deactivated;
      },
      async rollbackVersion(input) {
        const targetVersion = schemaVersions.get(input.id);
        if (!targetVersion) {
          throw createDemoError("SCHEMA_VERSION_NOT_FOUND", 404);
        }

        for (const version of schemaVersions.values()) {
          if (version.schemaKey === targetVersion.schemaKey && version.status === "active") {
            schemaVersions.set(version.id, {
              ...version,
              status: "inactive"
            });
          }
        }

        const activated = {
          ...targetVersion,
          status: "active"
        };
        schemaVersions.set(input.id, activated);

        return activated;
      },
      async compareVersions(input) {
        const left = schemaVersions.get(input.leftVersionId);
        const right = schemaVersions.get(input.rightVersionId);
        if (!left || !right) {
          throw createDemoError("SCHEMA_VERSION_NOT_FOUND", 404);
        }

        return {
          schemaKey: input.schemaKey,
          changedVersion: {
            left: left.version,
            right: right.version
          },
          fields: {
            added: [],
            removed: [],
            unchanged: ["clinicalDiagnosis", "sampleType"]
          }
        };
      }
    },
    fileService: {
      async createUpload(input) {
        return {
          id: "file-demo-001",
          storageKey: "demo/uploads/file-demo-001",
          input
        };
      },
      async getContent(id) {
        return {
          id,
          originalName: "demo-medical-record.pdf",
          mimeType: "application/pdf",
          body: Buffer.from("DEMO_MEDICAL_RECORD_BYTES")
        };
      }
    },
    jobService: {
      async create(input) {
        const body = input as { schemaKey?: string; sourceFileId?: string; document?: { documentId?: string; fileName?: string; mimeType?: string } };
        const jobId = `job-demo-${jobs.size + 1}`;
        const job: { id: string; status: string; schemaKey: string; sourceFileId?: string } = {
          id: jobId,
          status: "queued",
          schemaKey: body.schemaKey ?? "lims-clinical-info"
        };

        if (body.sourceFileId !== undefined) {
          job.sourceFileId = body.sourceFileId;
        }

        jobs.set(job.id, job);

        // Run mock orchestration for demo mode
        const result = await demoRecognitionOrchestrator.start({
          jobId: job.id,
          schemaKey: job.schemaKey,
          document: {
            documentId: body.document?.documentId ?? body.sourceFileId ?? job.id,
            fileName: body.document?.fileName ?? "demo-medical-record.pdf",
            mimeType: body.document?.mimeType ?? "application/pdf"
          }
        });

        const completedJob: { id: string; status: string; schemaKey: string; sourceFileId?: string } = {
          id: job.id,
          status: result.status,
          schemaKey: job.schemaKey
        };

        if (job.sourceFileId !== undefined) {
          completedJob.sourceFileId = job.sourceFileId;
        }

        jobs.set(job.id, completedJob);
        results.set(job.id, result);

        return {
          ...completedJob,
          trace: toDemoTrace(job.id)
        };
      },
      async get(id) {
        return jobs.get(id) ?? null;
      }
    },
    internalTestRecognitionService: {
      async createWithSyntheticProviders(input: unknown) {
        const body = input as { schemaKey?: string; sourceFileId?: string; document?: { documentId?: string; fileName?: string; mimeType?: string } };
        const job = {
          id: `job-demo-${jobs.size + 1}`,
          status: "queued",
          schemaKey: body.schemaKey ?? "lims-clinical-info"
        };

        if (body.sourceFileId !== undefined) {
          Object.assign(job, {
            sourceFileId: body.sourceFileId
          });
        }

        jobs.set(job.id, job);
        const result = await demoRecognitionOrchestrator.start({
          jobId: job.id,
          schemaKey: job.schemaKey,
          document: {
            documentId: body.document?.documentId ?? body.sourceFileId ?? job.id,
            fileName: body.document?.fileName ?? "demo-medical-record.pdf",
            mimeType: body.document?.mimeType ?? "application/pdf"
          }
        });
        const completedJob = {
          ...job,
          status: result.status
        };

        jobs.set(job.id, completedJob);
        results.set(job.id, result);

        return {
          ...completedJob,
          trace: toDemoTrace(job.id)
        };
      }
    },
    resultService: {
      async getByJobId(jobId) {
        const result = results.get(jobId);

        return result === undefined ? null : { ...result };
      }
    },
    feedbackService: {
      async create(input) {
        return {
          id: "feedback-demo-001",
          status: "open",
          input
        };
      }
    },
    writebackService: {
      async listEligible() {
        return [
          {
            id: "job-demo-writeback-001",
            jobId: "job-demo-writeback-001",
            schemaKey: "lims-clinical-info",
            sourceFileId: "file-demo-001",
            status: "completed",
            extractedFields: [
              {
                fieldKey: "clinicalDiagnosis",
                value: "演示诊断",
                confidence: 0.92
              }
            ],
            readyFields: [
              {
                fieldKey: "clinicalDiagnosis",
                targetPath: "clinicalInfo.clinicalDiagnosis",
                value: "演示诊断"
              }
            ],
            blockers: [],
            payload: {
              jobId: "job-demo-writeback-001",
              source: {
                fileId: "file-demo-001"
              },
              fields: [
                {
                  fieldKey: "clinicalDiagnosis",
                  value: "演示诊断"
                }
              ],
              result: {
                status: "completed",
                reviewRequired: false
              }
            }
          }
        ];
      },
      async execute(input) {
        return {
          id: "writeback-demo-001",
          status: "succeeded",
          input
        };
      }
    },
    providerService: {
      async listProviders() {
        return Array.from(demoProviders.values());
      },
      async saveProviderConfig(input) {
        const allowedKinds = ["ocr", "llm", "storage", "lims"] as const;
        if (!allowedKinds.includes(input.kind as (typeof allowedKinds)[number])) {
          throw createDemoError("PROVIDER_KIND_INVALID", 400);
        }
        if (readSavedProviderMode(input.config) === "mock") {
          throw createDemoError("REAL_PROVIDER_REQUIRED", 400);
        }

        const kind = input.kind as (typeof allowedKinds)[number];
        if (input.isDefault) {
          for (const provider of demoProviders.values()) {
            if (provider.kind === kind && provider.key !== input.key) {
              demoProviders.set(provider.key, {
                ...provider,
                isDefault: false
              });
            }
          }
        }

        const saved = {
          key: input.key,
          name: input.displayName,
          displayName: input.displayName,
          kind,
          enabled: input.enabled,
          isDefault: input.isDefault,
          isMock: false,
          config:
            input.config && typeof input.config === "object" && !Array.isArray(input.config)
              ? (input.config as Record<string, unknown>)
              : {},
          secretRefs:
            input.secretRefs && typeof input.secretRefs === "object" && !Array.isArray(input.secretRefs)
              ? (input.secretRefs as Record<string, unknown>)
              : {}
        };
        demoProviders.set(input.key, saved);

        return saved;
      },
      async setDefaultProvider(input) {
        const provider = demoProviders.get(input.key);
        if (!provider) {
          throw createDemoError("PROVIDER_NOT_FOUND", 404);
        }

        for (const item of demoProviders.values()) {
          if (item.kind === provider.kind) {
            demoProviders.set(item.key, {
              ...item,
              isDefault: item.key === input.key
            });
          }
        }

        return {
          key: input.key,
          isDefault: true
        };
      },
      async checkProviderHealth(input) {
        const provider = demoProviders.get(input.key);
        if (!provider) {
          throw createDemoError("PROVIDER_NOT_FOUND", 404);
        }

        const startTime = Date.now();
        let status = "healthy";
        let message = "";

        try {
          if (provider.kind === "ocr") {
            // 真正调用 OCR 服务健康检查
            const resp = await fetch(`${provider.config.endpoint}/health`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as { status?: string };
            message = `OCR 服务连接正常 (${provider.config.endpoint})`;
            if (data.status !== "ok") status = "degraded";
          } else if (provider.kind === "llm") {
            // 真正调用 LLM 服务健康检查
            const resp = await fetch(`${provider.config.endpoint}/models`, {
              headers: { "Authorization": `Bearer ${provider.secretRefs?.apiKey || ""}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            message = `LLM 服务连接正常 (${provider.config.endpoint})`;
          } else {
            message = `Provider ${provider.kind} 配置已加载`;
          }
        } catch (err) {
          status = "error";
          message = `连接失败: ${err instanceof Error ? err.message : String(err)}`;
        }

        return {
          key: input.key,
          kind: provider.kind,
          status,
          latencyMs: Date.now() - startTime,
          checkedAt: new Date().toISOString(),
          message
        };
      }
    },
    evaluationService: {
      async listDatasets() {
        return Array.from(evaluationDatasets.values()).map((dataset) => ({
          ...dataset,
          caseCount: evaluationSamples.get(dataset.id)?.length ?? 0
        }));
      },
      async createDataset(input) {
        const dataset = {
          id: `dataset-demo-${evaluationDatasets.size + 1}`,
          key: input.key,
          displayName: input.displayName,
          deidentified: input.deidentified,
          metadata: input.metadata
        };

        if (input.description !== undefined) {
          Object.assign(dataset, {
            description: input.description
          });
        }

        evaluationDatasets.set(dataset.id, dataset);
        evaluationSamples.set(dataset.id, []);

        return dataset;
      },
      async importSamples(input) {
        const dataset = evaluationDatasets.get(input.datasetId);
        if (!dataset?.deidentified) {
          throw createDemoError("EVALUATION_DATASET_NOT_DEIDENTIFIED", 409);
        }

        const currentSamples = evaluationSamples.get(input.datasetId) ?? [];
        const imported = input.samples.map((sample, index) => {
          const record = sample && typeof sample === "object" && !Array.isArray(sample) ? (sample as Record<string, unknown>) : {};
          const importedSample: {
            id: string;
            externalId?: string;
            groundTruth: unknown;
            metadata?: unknown;
          } = {
            id: `sample-demo-${currentSamples.length + index + 1}`,
            groundTruth: record.groundTruth
          };

          if (typeof record.externalId === "string") {
            importedSample.externalId = record.externalId;
          }

          if (record.metadata !== undefined) {
            importedSample.metadata = record.metadata;
          }

          return importedSample;
        });

        evaluationSamples.set(input.datasetId, [...currentSamples, ...imported]);

        return imported;
      },
      async listRuns(input) {
        const runs = Array.from(evaluationRuns.values());
        if (input.datasetId) {
          return runs.filter((run) => run.datasetId === input.datasetId);
        }

        return runs;
      },
      async createRun(input) {
        const run = {
          id: `run-demo-${evaluationRuns.size + 1}`,
          status: "queued",
          datasetId: input.datasetId,
          providerKey: input.providerKey
        };
        evaluationRuns.set(run.id, run);
        evaluationMetrics.set(run.id, [
          {
            name: "field_accuracy",
            value: 0.9,
            unit: "ratio"
          }
        ]);

        return run;
      },
      async getRun(input) {
        const run = evaluationRuns.get(input.id);
        if (!run) {
          return null;
        }

        return {
          ...run,
          summary: {
            fieldAccuracy: evaluationMetrics.get(run.id)?.find((metric) => metric.name === "field_accuracy")?.value ?? null
          }
        };
      },
      async listRunMetrics(input) {
        return evaluationMetrics.get(input.runId) ?? [];
      }
    }
  };
}

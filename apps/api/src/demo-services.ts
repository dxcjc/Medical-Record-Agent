import { UserStatus } from "@prisma/client";

import { PERMISSIONS } from "./auth/permissions";
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

/**
 * 创建本地开发用的完整 API 依赖集合。
 * 这里不连接真实数据库或外部 provider，只让 `pnpm dev:api` 能启动完整路由，方便前端 demo 和 API smoke test。
 */
export function createDemoApiServices(): ApiServerServices {
  const jobs = new Map<string, { id: string; status: string; schemaKey: string; sourceFileId?: string }>();
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
  demoProviders.set("mock-ocr", {
    key: "mock-ocr",
    name: "Mock Provider",
    displayName: "Mock Provider",
    kind: "ocr",
    enabled: true,
    isDefault: true,
    config: {
      provider: "mock",
      syntheticOnly: true
    },
    secretRefs: {
      apiKey: "demo-secret"
    }
  });
  demoProviders.set("mock-model", {
    key: "mock-model",
    name: "Mock Model Provider",
    displayName: "Mock Model Provider",
    kind: "llm",
    enabled: true,
    isDefault: true,
    config: {
      provider: "mock",
      model: "mock-medical-record-extractor",
      syntheticOnly: true
    },
    secretRefs: {}
  });
  demoProviders.set("local-storage", {
    key: "local-storage",
    name: "Local Storage Provider",
    displayName: "Local Storage Provider",
    kind: "storage",
    enabled: true,
    isDefault: true,
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
    config: {
      endpoint: "http://localhost:8090/api/clinical-info/writeback"
    },
    secretRefs: {
      apiToken: "demo-secret"
    }
  });

  function createDemoError(code: string, statusCode: number) {
    return Object.assign(new Error(code), {
      code,
      statusCode
    });
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
        const body = input as { schemaKey?: string; sourceFileId?: string };
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
        return job;
      },
      async get(id) {
        return jobs.get(id) ?? {
          id,
          status: "completed",
          schemaKey: "lims-clinical-info"
        };
      }
    },
    resultService: {
      async getByJobId(jobId) {
        return {
          jobId,
          fields: [
            {
              key: "clinicalDiagnosis",
              value: "演示诊断",
              confidence: 0.92
            }
          ],
          reviewRequired: false
        };
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
        return {
          key: input.key,
          status: "healthy",
          latencyMs: 12,
          checkedAt: new Date().toISOString(),
          message: "Demo provider 健康检查通过；未调用外部真实服务。"
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

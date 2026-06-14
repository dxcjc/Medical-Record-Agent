import { describe, expect, it, vi } from "vitest";

import {
  assertProductionQueueContract,
  buildSecretResolverContract,
  buildProductionQueueContract,
  buildProductionSessionInvalidationStoreContract,
  createEnvSecretResolver,
  createKmsSecretResolver,
  createProductionJobQueueAdapter,
  createSecretResolverFromEnv,
  createSecretManagerResolver,
  createProductionSessionInvalidationStore,
  createVaultSecretResolver,
  createProductionApiServices
} from "./production-services";

type ProductionApiServicesOptions = Parameters<typeof createProductionApiServices>[0];
type ProductionEnvStub = ProductionApiServicesOptions["env"];
type ProviderConfigFindUniqueInputStub = {
  where: {
    key: string;
  };
};

function createPrismaClientStub() {
  return {
    user: {},
    apiToken: {},
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    schemaDraft: {},
    schemaVersion: {
      findFirst: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
      findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null)
    },
    providerConfig: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async (_input: ProviderConfigFindUniqueInputStub): Promise<Record<string, unknown> | null> => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn(async (input) => ({
        id: "provider-config-001",
        ...input.create
      })),
      update: vi.fn(async (input) => ({
        id: "provider-config-001",
        key: input.where.key,
        kind: "llm",
        displayName: "Updated Provider",
        status: "active",
        isDefault: true,
        config: {},
        secretRefs: {}
      }))
    },
    storedFile: {
      create: vi.fn(async (input) => ({
        id: "file-001",
        ...input.data
      })),
      findUnique: vi.fn()
    },
    recognitionJob: {
      create: vi.fn(async (input) => ({
        id: "job-001",
        status: input.data.status,
        schemaKey: input.data.schemaKey
      })),
      findUnique: vi.fn(async () => ({
        id: "job-001",
        status: "completed",
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001",
        providerConfig: {},
        options: {},
        trace: [],
        warnings: [],
        error: null
      })),
      update: vi.fn(async (input) => ({
        id: input.where.id,
        ...input.data
      }))
    },
    recognitionResult: {
      findUnique: vi.fn(async () => ({
        id: "result-001",
        jobId: "job-001",
        fields: [],
        normalizedFields: [],
        evidence: [],
        payload: {
          writeback: {
            readyFields: [
              {
                fieldKey: "clinicalDiagnosis",
                targetPath: "clinicalInfo.clinicalDiagnosis",
                value: "服务端持久化诊断"
              }
            ]
          }
        },
        confidence: null,
        reviewRequired: false
      })),
      upsert: vi.fn(async (input) => ({
        id: "result-001",
        jobId: input.where.jobId,
        ...input.create
      }))
    },
    feedbackSubmission: {},
    writebackAttempt: {
      create: vi.fn(async (input) => ({
        id: "writeback-001",
        ...input.data
      })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async (input) => ({
        id: input.where.id,
        ...input.data
      }))
    },
    evaluationDataset: {
      findUnique: vi.fn(async () => ({
        id: "dataset-001",
        deidentified: true,
        metadata: {
          sourceType: "synthetic"
        }
      })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0)
    },
    evaluationSample: {
      findMany: vi.fn(async () => [
        {
          id: "sample-001",
          datasetId: "dataset-001",
          fileId: "file-001",
          externalId: "synthetic-001",
          groundTruth: {
            clinicalDiagnosis: {
              value: "模拟诊断",
              normalizedValue: "模拟诊断"
            }
          },
          metadata: {
            sourceType: "synthetic",
            deidentified: true,
            evaluationInput: {
              fileName: "synthetic-evaluation-record.pdf",
              mimeType: "application/pdf",
              storageKey: "synthetic/evaluation-record.pdf"
            }
          }
        }
      ])
    },
    evaluationRun: {
      create: vi.fn(async (input) => ({
        id: "run-001",
        status: "queued",
        ...input.data
      })),
      update: vi.fn(async (input) => ({
        id: input.where.id,
        ...input.data
      })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0)
    },
    evaluationMetric: {
      upsert: vi.fn(async (input) => ({
        id: `metric-${input.where.runId_name.name}`,
        ...input.create
      })),
      findMany: vi.fn(async () => [])
    }
  };
}

function createProductionEnvStub(): ProductionEnvStub {
  return {
    jwt: {
      secret: "test-secret-with-more-than-32-characters",
      expiresIn: "1h",
      refreshExpiresIn: "7d"
    },
    storage: {
      driver: "local" as const,
      localDir: "./storage-test",
      s3: {
        endpoint: undefined,
        region: undefined,
        bucket: undefined,
        accessKeyId: undefined,
        secretAccessKey: undefined
      }
    },
      providers: {
        ocr: {
        provider: "none" as const,
        endpoint: undefined,
        apiKey: undefined
      },
      llm: {
        provider: "none" as const,
        model: "unconfigured-real-model",
        baseUrl: undefined,
        apiKey: undefined,
        openAiApiKey: undefined
      }
    },
    lims: {
      baseUrl: "http://localhost:8090",
      clinicalInfoEndpoint: "/api/clinical-info/writeback",
      apiToken: "secret-lims-token",
      timeoutMs: 10000
    }
  };
}

function createProductionEnvWithRealProvidersStub(): ProductionEnvStub {
  const env = createProductionEnvStub();
  env.providers = {
    ocr: {
      provider: "http",
      endpoint: "http://ocr.example.test/recognize",
      apiKey: undefined
    },
    llm: {
      provider: "openai-responses",
      model: "gpt-4.1-mini",
      baseUrl: undefined,
      apiKey: undefined,
      openAiApiKey: "test-openai-api-key"
    }
  };

  return env;
}

function createOpenAiResponsesClientStub(fieldKey = "clinicalDiagnosis", value = "模拟诊断") {
  return {
    responses: {
      create: vi.fn(async () => ({
        output_text: JSON.stringify({
          fields: [
            {
              fieldKey,
              value,
              rawValue: `诊断：${value}`,
              confidence: 0.96,
              evidence: [
                {
                  snippet: `诊断：${value}`,
                  startOffset: 0,
                  endOffset: value.length + 3,
                  pageNumber: 1
                }
              ]
            }
          ]
        })
      }))
    }
  };
}

function createProviderRuntimeFetchStub() {
  return vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    new Response(
      JSON.stringify({
        pages: [
          {
            page: 1,
            text: "合成病历：诊断：模拟诊断。",
            confidence: 0.99,
            blocks: [
              {
                blockId: "ocr-block-1",
                text: "合成病历：诊断：模拟诊断。",
                confidence: 0.99,
                coordinates: { x: 0, y: 0, width: 100, height: 20 }
              }
            ]
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
}

function createSyntheticRecognitionDocument(documentId: string) {
  return {
    documentId,
    fileName: "demo-record.pdf",
    mimeType: "application/pdf",
    content: Buffer.from("SYNTHETIC_MEDICAL_RECORD_BYTES")
  };
}

function createProviderManagerActor() {
  return {
    actorUserId: "user-001",
    authType: "jwt" as const,
    permissions: ["provider:manage"],
    roles: ["admin"]
  };
}

async function drainProductionJobs(services: ReturnType<typeof createProductionApiServices>) {
  await services.jobQueue?.drain();
}

describe("production api services bootstrap", () => {
  it("无真实 OCR/LLM provider 时业务 provider 列表不返回 mock 或开发占位", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const providers = await services.providerService.listProviders();
    expect(JSON.stringify(providers)).not.toContain("mock-ocr");
    expect(JSON.stringify(providers)).not.toContain("mock-model");
    expect(JSON.stringify(providers)).not.toContain("development_placeholder");
    expect(providers).toEqual([
      expect.objectContaining({
        key: "lims-writeback",
        kind: "lims",
        secretRefs: {
          apiToken: "configured"
        }
      }),
      expect.objectContaining({
        key: "local-storage",
        kind: "storage",
        secretRefs: {}
      })
    ]);
  });

  it("无真实 OCR/LLM provider 时阻断识别创建而不是落回 mock", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.jobService.create({
        schemaKey: "lims-clinical-info",
        document: {
          documentId: "demo-document-no-provider",
          fileName: "demo-record.pdf",
          mimeType: "application/pdf"
        }
      })
    ).rejects.toMatchObject({
      code: "REAL_PROVIDER_NOT_CONFIGURED",
      statusCode: 503
    });
    expect(prisma.recognitionJob.create).not.toHaveBeenCalled();
  });

  it("装配真实 service 依赖，并让写回路径调用 LIMS adapter", async () => {
    const prisma = createPrismaClientStub();
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-result-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };

    const services = createProductionApiServices({
      env: {
        ...createProductionEnvStub(),
        providers: {
          ...createProductionEnvStub().providers,
          ocr: {
            provider: "http" as const,
            endpoint: "http://ocr.example.test/recognize",
            apiKey: undefined
          },
          llm: {
            provider: "openai-responses" as const,
            model: "gpt-4.1-mini",
            baseUrl: undefined,
            apiKey: undefined,
            openAiApiKey: "test-openai-api-key"
          }
        }
      },
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      openAiResponsesClient: {
        responses: {
          create: vi.fn()
        }
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.providerService.checkProviderHealth({
        key: "local-storage",
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["provider:manage"],
          roles: ["admin"]
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        key: "local-storage",
        kind: "storage",
        status: "healthy",
        message: "Storage provider 受控读写删除探针通过。",
        probe: expect.objectContaining({
          verified: true
        })
      })
    );

    await expect(
      services.providerService.checkProviderHealth({
        key: "mock-ocr",
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["provider:manage"],
          roles: ["admin"]
        }
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_NOT_FOUND",
      statusCode: 404
    });

    await expect(
      services.providerService.setDefaultProvider({
        key: "mock-ocr",
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["provider:manage"],
          roles: ["admin"]
        }
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_NOT_FOUND",
      statusCode: 404
    });

    await services.writebackService.execute({
      jobId: "job-001",
      confirmed: true,
      idempotencyKey: "job-001:manual",
      payload: {
        clinicalInfo: {
          clinicalDiagnosis: "客户端伪造诊断"
        }
      },
      fields: [],
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["writeback:execute"],
        roles: ["admin"]
      },
    } as never);

    expect(limsAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "writeback-001",
        recognitionResultId: "job-001",
        limsSampleId: "job-001",
        requestedByUserId: "user-001",
        idempotencyKey: "job-001:manual",
        fields: [
          {
            sourceFieldKey: "clinicalDiagnosis",
            targetFieldKey: "clinicalInfo.clinicalDiagnosis",
            value: "服务端持久化诊断"
          }
        ],
        payload: {
          clinicalInfo: {
            clinicalDiagnosis: "服务端持久化诊断"
          }
        }
      })
    );
    expect(limsAdapter.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          clinicalInfo: {
            clinicalDiagnosis: "客户端伪造诊断"
          }
        }
      })
    );
    expect(prisma.writebackAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "writeback-001"
        },
        data: expect.objectContaining({
          status: "succeeded",
          responsePayload: expect.objectContaining({
            externalReceiptId: "LIMS-OK-001"
          }),
          retryable: false
        })
      })
    );
  });

  it("生产手工写回缺 RecognitionResult readyFields 时拒绝裸 fields，避免绕过服务端可信边界", async () => {
    const prisma = createPrismaClientStub();
    vi.mocked(prisma.recognitionResult.findUnique).mockResolvedValueOnce({
      id: "result-no-ready-fields",
      jobId: "job-001",
      fields: [],
      normalizedFields: [],
      evidence: [],
      payload: {
        writeback: {
          readyFields: []
        }
      },
      confidence: null,
      reviewRequired: false
    });
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-result-should-not-run",
        requestId: "writeback-should-not-run",
        status: "success" as const,
        externalReceiptId: "LIMS-SHOULD-NOT-RUN",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.writebackService.execute({
        jobId: "job-001",
        confirmed: true,
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "客户端裸 fields 不可信"
          }
        ],
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["writeback:execute"],
          roles: ["admin"]
        }
      } as never)
    ).rejects.toMatchObject({
      code: "WRITEBACK_NOT_READY",
      statusCode: 409
    });
    expect(limsAdapter.execute).not.toHaveBeenCalled();
    expect(prisma.writebackAttempt.create).not.toHaveBeenCalled();
  });

  it("生产写回 executor 拒绝未标记为服务端 workflow 的裸 fields 输入", async () => {
    const prisma = createPrismaClientStub();
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-result-should-not-run",
        requestId: "writeback-should-not-run",
        status: "success" as const,
        externalReceiptId: "LIMS-SHOULD-NOT-RUN",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.writebackService.execute({
        jobId: "job-001",
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "裸 fields 不应进入 LIMS"
          }
        ]
      } as never)
    ).rejects.toMatchObject({
      code: "WRITEBACK_REQUIRES_SERVER_WORKFLOW_SOURCE",
      statusCode: 403
    });
    expect(limsAdapter.execute).not.toHaveBeenCalled();
    expect(prisma.writebackAttempt.create).not.toHaveBeenCalled();
  });

  it("生产识别编排把状态流转写入 Prisma 任务仓库", async () => {
    const prisma = createPrismaClientStub();
    const recognitionJobUpdate = vi.mocked(prisma.recognitionJob.update);
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-transition-result-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-TRANSITION-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };

    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-001")
    });
    await drainProductionJobs(services);

    expect(recognitionJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-001"
        },
        data: expect.objectContaining({
          status: "queued"
        })
      })
    );
    expect(recognitionJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-001"
        },
        data: expect.objectContaining({
          status: "running"
        })
      })
    );
    expect(recognitionJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-001"
        },
        data: expect.objectContaining({
          status: "writeback_completed"
        })
      })
    );
    expect(limsAdapter.execute).toHaveBeenCalledTimes(1);
  });

  it("生产高置信识别会自动调用 LIMS 写回 adapter 并持久化写回结果", async () => {
    const prisma = createPrismaClientStub();
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-result-auto-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-AUTO-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const job = await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-auto-writeback")
    });
    await drainProductionJobs(services);

    expect(limsAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "writeback-001",
        recognitionResultId: "job-001",
        limsSampleId: "job-001",
        requestedByUserId: "system",
        fields: [
          expect.objectContaining({
            sourceFieldKey: "clinicalDiagnosis",
            targetFieldKey: "clinicalInfo.clinicalDiagnosis",
            value: "模拟诊断"
          })
        ],
        payload: {
          clinicalInfo: {
            clinicalDiagnosis: "模拟诊断"
          }
        }
      })
    );
    expect(prisma.writebackAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-001",
          requestPayload: expect.objectContaining({
            clinicalInfo: {
              clinicalDiagnosis: "模拟诊断"
            }
          })
        })
      })
    );
    expect(prisma.writebackAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "writeback-001"
        },
        data: expect.objectContaining({
          status: "succeeded",
          responsePayload: expect.objectContaining({
            externalReceiptId: "LIMS-AUTO-OK-001"
          })
        })
      })
    );
    expect(job).toEqual(
      expect.objectContaining({
        id: "job-001",
        status: "queued",
        executionMode: "asynchronous"
      })
    );
  });

  it("生产识别任务会拒绝当前环境未配置的 providerConfig，避免静默落回默认 provider", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-provider-config"),
      providerConfig: {
        ocrProviderKey: "missing-ocr",
        providerKey: "missing-model"
      }
    });
    await drainProductionJobs(services);

    expect(prisma.recognitionResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            status: "failed",
            error: expect.objectContaining({
              code: "PROVIDER_CONFIG_NOT_AVAILABLE",
              message: "识别任务选择的 provider 未在当前生产环境启用。"
            })
          })
        })
      })
    );
  });

  it("生产识别任务会拒绝数据库中保存的 mock providerConfig", async () => {
    const prisma = createPrismaClientStub();
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-saved-provider-result-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-SAVED-PROVIDER-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    vi.mocked(prisma.providerConfig.findUnique).mockImplementation(async (input) => {
      const key = input.where.key;
      if (key === "saved-mock-ocr") {
        return {
          id: "provider-ocr-001",
          key,
          kind: "ocr",
          displayName: "保存的 Mock OCR",
          status: "active",
          isDefault: false,
          config: {
            providerKind: "Mock",
            blocks: [
              {
                page: 1,
                blockId: "saved-ocr-block-1",
                text: "在线配置 OCR 文本：诊断：在线配置诊断。",
                confidence: 0.99,
                coordinates: { x: 0, y: 0, width: 100, height: 20 }
              }
            ]
          },
          secretRefs: {},
          updatedById: "user-001",
          createdAt: new Date("2026-06-05T08:00:00.000Z"),
          updatedAt: new Date("2026-06-05T08:00:00.000Z")
        };
      }
      if (key === "saved-mock-model") {
        return {
          id: "provider-llm-001",
          key,
          kind: "llm",
          displayName: "保存的 Mock LLM",
          status: "active",
          isDefault: false,
          config: {
            providerKind: "Mock",
            candidates: [
              {
                fieldKey: "clinicalDiagnosis",
                value: "在线配置诊断",
                rawValue: "诊断：在线配置诊断",
                confidence: 0.97,
                evidence: [
                  {
                    snippet: "诊断：在线配置诊断",
                    startOffset: 8,
                    endOffset: 18,
                    pageNumber: 1
                  }
                ]
              }
            ]
          },
          secretRefs: {},
          updatedById: "user-001",
          createdAt: new Date("2026-06-05T08:00:00.000Z"),
          updatedAt: new Date("2026-06-05T08:00:00.000Z")
        };
      }

      return null;
    });
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-saved-provider"),
      providerConfig: {
        ocrProviderKey: "saved-mock-ocr",
        providerKey: "saved-mock-model"
      }
    });
    await drainProductionJobs(services);

    expect(prisma.recognitionResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            status: "failed",
            error: expect.objectContaining({
              code: "PROVIDER_CONFIG_NOT_AVAILABLE"
            })
          })
        })
      })
    );
  });

  it("生产 LangChain provider 未注入真实模型时会启动期失败，避免空候选伪成功", () => {
    const env = createProductionEnvStub();
    env.providers.ocr = {
      provider: "http",
      endpoint: "http://ocr.example.test/recognize",
      apiKey: undefined
    };
    env.providers.llm = {
      provider: "langchain",
      model: "langchain-configured-model",
      baseUrl: undefined,
      apiKey: undefined,
      openAiApiKey: undefined
    };

    expect(() =>
      createProductionApiServices({
        env,
        prisma: createPrismaClientStub() as never,
        now: () => new Date("2026-06-05T09:00:00.000Z")
      })
    ).toThrow(/LANGCHAIN_MODEL_NOT_CONFIGURED/);
  });

  it("生产 LangChain provider 使用注入的真实模型形状执行结构化抽取", async () => {
    const prisma = createPrismaClientStub();
    const env = createProductionEnvStub();
    env.providers.ocr = {
      provider: "http",
      endpoint: "http://ocr.example.test/recognize",
      apiKey: undefined
    };
    env.providers.llm = {
      provider: "langchain",
      model: "langchain-configured-model",
      baseUrl: "https://llm-gateway.example.test/v1",
      apiKey: "secret-langchain-key",
      openAiApiKey: undefined
    };
    const invoke = vi.fn(async () => ({
      fields: [
        {
          fieldKey: "clinicalDiagnosis",
          value: "肺腺癌",
          rawValue: "诊断：肺腺癌",
          confidence: 0.96,
          evidence: [
            {
              snippet: "诊断：肺腺癌",
              startOffset: 0,
              endOffset: 6,
              pageNumber: 1
            }
          ]
        }
      ]
    }));
    const withStructuredOutput = vi.fn(() => ({ invoke }));
    const services = createProductionApiServices({
      env,
      prisma: prisma as never,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      langChainModel: {
        withStructuredOutput
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-langchain")
    });
    await drainProductionJobs(services);

    expect(withStructuredOutput).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(expect.stringContaining("字段"));
    expect(JSON.stringify(prisma.recognitionResult.upsert.mock.calls)).toContain("langchain-structured-output");
  });

  it("生产 OpenAI Responses provider 使用注入的真实 SDK client 形状而不是占位 throw", async () => {
    const prisma = createPrismaClientStub();
    const env = createProductionEnvStub();
    env.providers.ocr = {
      provider: "http",
      endpoint: "http://ocr.example.test/recognize",
      apiKey: undefined
    };
    env.providers.llm = {
      provider: "openai-responses",
      model: "gpt-4.1-mini",
      baseUrl: undefined,
      apiKey: undefined,
      openAiApiKey: "secret-openai-api-key"
    };
    const responsesCreate = vi.fn(async () => ({
      output_text: JSON.stringify({
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "肺腺癌",
            rawValue: "诊断：肺腺癌",
            confidence: 0.96,
            evidence: [
              {
                snippet: "诊断：肺腺癌",
                startOffset: 0,
                endOffset: 6,
                pageNumber: 1
              }
            ]
          }
        ]
      })
    }));
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-openai-responses-result-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-OPENAI-RESPONSES-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    const services = createProductionApiServices({
      env,
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: {
        responses: {
          create: responsesCreate
        }
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-openai-responses")
    });
    await drainProductionJobs(services);

    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        input: expect.stringContaining("字段")
      })
    );
    expect(JSON.stringify(prisma.recognitionResult.upsert.mock.calls)).not.toContain(
      "OPENAI_RESPONSES_CLIENT_NOT_INJECTED"
    );
  });

  it("生产识别任务会拒绝当前环境未启用的 schemaKey，避免静默落回 LIMS 默认 schema", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "custom-clinical-schema",
      document: createSyntheticRecognitionDocument("demo-document-schema-config")
    });
    await drainProductionJobs(services);

    expect(prisma.recognitionResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: expect.objectContaining({
            status: "failed",
            error: expect.objectContaining({
              code: "SCHEMA_CONFIG_NOT_AVAILABLE",
              message: "识别任务选择的 schema 未在当前生产编排中启用。"
            })
          })
        })
      })
    );
  });

  it("生产识别任务会使用数据库 active schema version 的写回路径", async () => {
    const prisma = createPrismaClientStub();
    const limsAdapter = {
      execute: vi.fn(async () => ({
        id: "lims-result-custom-schema-001",
        requestId: "writeback-001",
        status: "success" as const,
        externalReceiptId: "LIMS-CUSTOM-SCHEMA-OK-001",
        retryable: false,
        completedAt: "2026-06-05T09:00:00.000Z"
      }))
    };
    vi.mocked(prisma.schemaVersion.findFirst).mockResolvedValueOnce({
      id: "schema-version-custom-001",
      schemaKey: "custom-clinical-schema",
      version: 3,
      displayName: "自定义临床信息 schema",
      status: "active",
      changelog: "测试 active schema 写回路径",
      publishedById: null,
      createdAt: new Date("2026-06-05T08:00:00.000Z"),
      updatedAt: new Date("2026-06-05T08:00:00.000Z"),
      definition: {
        key: "custom-clinical-schema",
        label: "自定义临床信息",
        version: "3.0.0",
        evidencePolicy: {
          required: true,
          minConfidence: 0.78,
          requireSourceText: true,
          requirePageReference: true
        },
        fields: [
          {
            key: "clinicalDiagnosis",
            label: "临床诊断",
            type: "string",
            comments: ["用于验证生产识别会读取数据库 active schema 的字段定义。"],
            adapterHints: {
              limsTargetPath: "clinicalInfo.customDiagnosis",
              writebackMode: "preview"
            }
          }
        ]
      }
    });
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "custom-clinical-schema",
      document: createSyntheticRecognitionDocument("demo-document-custom-schema")
    });
    await drainProductionJobs(services);

    const resultPayload = vi.mocked(prisma.recognitionResult.upsert).mock.calls.at(-1)?.[0].create.payload;

    expect(prisma.schemaVersion.findFirst).toHaveBeenCalledWith({
      where: {
        schemaKey: "custom-clinical-schema",
        status: "active"
      },
      orderBy: {
        version: "desc"
      }
    });
    expect(resultPayload).toEqual(
      expect.objectContaining({
        status: "writeback_completed",
        writeback: expect.objectContaining({
          readyFields: [
            expect.objectContaining({
              fieldKey: "clinicalDiagnosis",
              targetPath: "clinicalInfo.customDiagnosis"
            })
          ]
        })
      })
    );
    expect(resultPayload).not.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "SCHEMA_CONFIG_NOT_AVAILABLE"
        })
      })
    );
    expect(limsAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            sourceFieldKey: "clinicalDiagnosis",
            targetFieldKey: "clinicalInfo.customDiagnosis"
          })
        ],
        payload: {
          clinicalInfo: {
            customDiagnosis: "模拟诊断"
          }
        }
      })
    );
  });

  it("生产评估运行会执行 core runner、创建评估识别任务并持久化指标", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const run = await services.evaluationService.createRun({
      datasetId: "dataset-001",
      providerKey: "openai-responses-model",
      sampleLimit: 1,
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });

    expect(prisma.evaluationSample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          datasetId: "dataset-001"
        },
        take: 1
      })
    );
    expect(prisma.recognitionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schemaKey: "lims-clinical-info",
          createdById: "user-001",
          providerConfig: {
            providerKey: "openai-responses-model"
          },
          sourceFileId: null,
          options: expect.objectContaining({
            evaluationRunId: "run-001",
            evaluationSampleId: "sample-001"
          })
        })
      })
    );
    expect(prisma.evaluationMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          runId_name: {
            runId: "run-001",
            name: "field_accuracy"
          }
        },
        create: expect.objectContaining({
          runId: "run-001",
          name: "field_accuracy",
          value: 1,
          unit: "ratio"
        })
      })
    );
    expect(prisma.evaluationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "run-001"
        },
        data: expect.objectContaining({
          status: "completed",
          summary: expect.objectContaining({
            datasetId: "dataset-001",
            totalSamples: 1,
            completedSamples: 1
          })
        })
      })
    );
    expect(run).toEqual(
      expect.objectContaining({
        id: "run-001",
        status: "completed"
      })
    );
  });

  it("生产评估运行会按 run schemaKey 解析 active schema，而不是固定使用内置 LIMS schema", async () => {
    const prisma = createPrismaClientStub();
    vi.mocked(prisma.schemaVersion.findUnique).mockResolvedValue({
      id: "schema-version-custom-eval-002",
      schemaKey: "custom-evaluation-schema",
      version: 2,
      displayName: "自定义评估 schema",
      status: "active",
      changelog: "测试 evaluation runner schema resolution",
      publishedById: null,
      createdAt: new Date("2026-06-05T08:00:00.000Z"),
      updatedAt: new Date("2026-06-05T08:00:00.000Z"),
      definition: {
        key: "custom-evaluation-schema",
        label: "自定义评估 schema",
        version: "2.0.0",
        evidencePolicy: {
          required: true,
          minConfidence: 0.78,
          requireSourceText: true,
          requirePageReference: true
        },
        fields: [
          {
            key: "customDiagnosis",
            label: "自定义诊断",
            type: "string",
            comments: ["用于证明 production evaluation runner 不再固定 clinicalDiagnosis。"],
            adapterHints: {
              limsTargetPath: "clinicalInfo.customDiagnosis",
              writebackMode: "preview"
            }
          }
        ]
      }
    });
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: createProviderRuntimeFetchStub() as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub("customDiagnosis", "模拟诊断"),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.evaluationService.createRun({
      datasetId: "dataset-001",
      schemaKey: "custom-evaluation-schema",
      schemaVersionId: "schema-version-custom-eval-002",
      providerKey: "openai-responses-model",
      sampleLimit: 1,
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });

    expect(prisma.schemaVersion.findUnique).toHaveBeenCalledWith({
      where: {
        id: "schema-version-custom-eval-002"
      }
    });
    expect(prisma.evaluationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerConfig: {
            providerKey: "openai-responses-model"
          },
          schemaVersionId: "schema-version-custom-eval-002"
        })
      })
    );
    expect(prisma.recognitionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schemaKey: "custom-evaluation-schema",
          schemaVersionId: "schema-version-custom-eval-002",
          sourceFileId: null,
          providerConfig: {
            providerKey: "openai-responses-model"
          },
          options: expect.objectContaining({
            evaluationRunId: "run-001",
            evaluationSampleId: "sample-001"
          })
        })
      })
    );
    expect(prisma.recognitionResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fields: [
            expect.objectContaining({
              fieldKey: "customDiagnosis"
            })
          ],
          payload: expect.objectContaining({
            extraction: expect.objectContaining({
              candidates: [
                expect.objectContaining({
                  fieldKey: "customDiagnosis"
                })
              ]
            })
          })
        })
      })
    );
    expect(prisma.recognitionResult.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fields: [
            expect.objectContaining({
              fieldKey: "clinicalDiagnosis"
            })
          ]
        })
      })
    );
    expect(prisma.evaluationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          schemaVersion: {
            connect: {
              id: "schema-version-custom-eval-002"
            }
          },
          summary: expect.objectContaining({
            schemaKey: "custom-evaluation-schema",
            schemaVersionId: "schema-version-custom-eval-002",
            schemaSource: "database"
          })
        })
      })
    );
  });

  it("生产文件上传会通过配置的存储 provider 写入字节", async () => {
    const prisma = createPrismaClientStub();
    const storageProvider = {
      put: vi.fn(async (input) => ({
        key: input.key,
        size: input.body.byteLength,
        contentType: input.contentType
      })),
      get: vi.fn(),
      delete: vi.fn()
    };
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.fileService.createUpload({
      originalName: "record.pdf",
      mimeType: "application/pdf",
      checksumSha256: "b66f1b66ec824925d01f389a3494722c0676af4d131cc3bd7d38b7c06bf62d61",
      contentBase64: Buffer.from("DEMO_PDF_BYTES").toString("base64")
    });

    expect(storageProvider.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^uploads\/2026-06-05\/[0-9a-f]{8}-record\.pdf$/),
        body: Buffer.from("DEMO_PDF_BYTES"),
        contentType: "application/pdf"
      })
    );
    expect(prisma.storedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: expect.stringMatching(/^uploads\/2026-06-05\/[0-9a-f]{8}-record\.pdf$/),
          byteSize: BigInt(14)
        })
      })
    );
  });

  it("生产 Storage provider 健康检查会执行受控读写删除探针", async () => {
    const prisma = createPrismaClientStub();
    const storageProvider = {
      put: vi.fn(async (input) => ({
        key: input.key,
        size: input.body.byteLength,
        contentType: input.contentType
      })),
      get: vi.fn(async (key) => ({
        key,
        size: Buffer.byteLength("health-check"),
        body: Buffer.from("health-check"),
        contentType: "text/plain"
      })),
      delete: vi.fn()
    };
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const health = await services.providerService.checkProviderHealth({
      key: "local-storage",
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["provider:manage"],
        roles: ["admin"]
      }
    });

    expect(storageProvider.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "health-check/provider-health-2026-06-05T09-00-00-000Z.txt",
        body: Buffer.from("health-check"),
        contentType: "text/plain"
      })
    );
    expect(storageProvider.get).toHaveBeenCalledWith("health-check/provider-health-2026-06-05T09-00-00-000Z.txt");
    expect(storageProvider.delete).toHaveBeenCalledWith("health-check/provider-health-2026-06-05T09-00-00-000Z.txt");
    expect(health).toEqual(
      expect.objectContaining({
        key: "local-storage",
        kind: "storage",
        status: "healthy",
        latencyMs: expect.any(Number),
        probe: {
          key: "health-check/provider-health-2026-06-05T09-00-00-000Z.txt",
          size: Buffer.byteLength("health-check"),
          verified: true
        }
      })
    );
  });

  it("生产 HTTP OCR provider 健康检查会执行可注入的最小请求并隐藏 apiKey", async () => {
    const prisma = createPrismaClientStub();
    const healthFetch = vi.fn(async () => ({
      ok: true,
      status: 204,
      statusText: "No Content"
    }));
    const env = createProductionEnvStub();
    env.providers.ocr = {
      provider: "http",
      endpoint: "http://ocr.internal/api/recognize",
      apiKey: "secret-ocr-api-key"
    };
    const services = createProductionApiServices({
      env,
      prisma: prisma as never,
      providerHealthFetch: healthFetch,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const health = await services.providerService.checkProviderHealth({
      key: "http-ocr",
      actor: createProviderManagerActor()
    });

    expect(healthFetch).toHaveBeenCalledWith(
      "http://ocr.internal/api/recognize",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer secret-ocr-api-key"
        }
      })
    );
    expect(JSON.stringify(health)).not.toContain("secret-ocr-api-key");
    expect(health).toEqual(
      expect.objectContaining({
        key: "http-ocr",
        kind: "ocr",
        status: "healthy",
        message: "HTTP OCR provider 最小健康探针通过。",
        probe: {
          method: "GET",
          url: "http://ocr.internal/api/recognize",
          statusCode: 204
        },
        secretRefs: {
          apiKey: "configured"
        }
      })
    );
  });

  it("生产 HTTP OCR provider 健康检查失败时返回脱敏结果", async () => {
    const prisma = createPrismaClientStub();
    const healthFetch = vi.fn(async () => {
      throw new Error("network failed with secret-ocr-api-key");
    });
    const env = createProductionEnvStub();
    env.providers.ocr = {
      provider: "http",
      endpoint: "http://ocr.internal/api/recognize",
      apiKey: "secret-ocr-api-key"
    };
    const services = createProductionApiServices({
      env,
      prisma: prisma as never,
      providerHealthFetch: healthFetch,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const health = await services.providerService.checkProviderHealth({
      key: "http-ocr",
      actor: createProviderManagerActor()
    });

    expect(JSON.stringify(health)).not.toContain("secret-ocr-api-key");
    expect(health).toEqual(
      expect.objectContaining({
        key: "http-ocr",
        kind: "ocr",
        status: "unhealthy",
        message: "HTTP OCR provider 健康探针失败，请检查 endpoint、认证或内网连通性。",
        probe: expect.objectContaining({
          method: "GET",
          url: "http://ocr.internal/api/recognize"
        }),
        secretRefs: { apiKey: "configured" }
      })
    );
  });

  it("生产 LIMS provider 健康检查会用 baseUrl 和 endpoint 执行 dry-run ping 且不泄露 token", async () => {
    const prisma = createPrismaClientStub();
    const healthFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable"
    }));
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      providerHealthFetch: healthFetch,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const health = await services.providerService.checkProviderHealth({
      key: "lims-writeback",
      actor: createProviderManagerActor()
    });

    expect(healthFetch).toHaveBeenCalledWith(
      "http://localhost:8090/api/clinical-info/writeback",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret-lims-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dryRun: true,
          ping: true,
          source: "provider-health"
        })
      })
    );
    expect(JSON.stringify(health)).not.toContain("secret-lims-token");
    expect(health).toEqual(
      expect.objectContaining({
        key: "lims-writeback",
        kind: "lims",
        status: "degraded",
        message: "LIMS writeback adapter dry-run ping 未通过，请检查 LIMS 服务状态。",
        probe: {
          method: "POST",
          url: "http://localhost:8090/api/clinical-info/writeback",
          statusCode: 503,
          dryRun: true
        },
        secretRefs: {
          apiToken: "configured"
        }
      })
    );
  });

  it("env secret resolver 会按 secretRefs 解析密钥且缺失时返回明确 unresolved", async () => {
    const resolver = createEnvSecretResolver({
      env: {
        OCR_VENDOR_TOKEN: "resolved-ocr-token"
      }
    });

    await expect(resolver.resolve("OCR_VENDOR_TOKEN")).resolves.toEqual({
      resolved: true,
      value: "resolved-ocr-token",
      source: "env"
    });
    await expect(resolver.resolve("MISSING_VENDOR_TOKEN")).resolves.toEqual({
      resolved: false,
      source: "env",
      reason: "SECRET_NOT_FOUND"
    });
  });

  it("生产 secret resolver contract 明确 env 不是 KMS/Vault 且空 ref 会 fail-fast", async () => {
    const resolver = createEnvSecretResolver({
      env: {
        LLM_VENDOR_TOKEN: "resolved-llm-token"
      }
    });

    await expect(resolver.resolve("")).resolves.toEqual({
      resolved: false,
      source: "env",
      reason: "SECRET_REF_INVALID"
    });
    await expect(resolver.resolve("LLM_VENDOR_TOKEN")).resolves.toEqual({
      resolved: true,
      value: "resolved-llm-token",
      source: "env"
    });
  });

  it("secret resolver 工厂为 Vault/KMS/Secret Manager 预留 fail-fast 边界且不伪造真实接入", async () => {
    expect(buildSecretResolverContract({})).toEqual({
      provider: "env",
      productionReady: false,
      blockedReason: "SECRET_RESOLVER_ENV_ONLY",
      requiredExternal: ["KMS", "Vault", "Secret Manager"],
      redaction: {
        secretValueExposed: false,
        exposeRefsOnly: true,
        frontendVisible: false
      },
      readiness: {
        nextAction:
          "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
        requiredChecks: ["external-secret-resolution-smoke", "provider-health-secretRefs-smoke"]
      },
      config: {}
    });

    expect(
      buildSecretResolverContract({
        SECRET_RESOLVER_PROVIDER: "vault",
        VAULT_ADDR: "https://vault.example.test"
      })
    ).toEqual(
      expect.objectContaining({
        provider: "vault",
        productionReady: false,
        blockedReason: "SECRET_RESOLVER_CONTRACT_INCOMPLETE",
        missingKeys: ["VAULT_TOKEN"]
      })
    );

    const resolver = createSecretResolverFromEnv({
      SECRET_RESOLVER_PROVIDER: "kms",
      KMS_KEY_ID: "medical-record-agent-key",
      KMS_REGION: "cn-hangzhou"
    });

    expect(resolver.contract).toEqual(
      expect.objectContaining({
        provider: "kms",
        productionReady: false,
        blockedReason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED",
        redaction: {
          secretValueExposed: false,
          exposeRefsOnly: true,
          frontendVisible: false
        },
        readiness: {
          nextAction:
            "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
          requiredChecks: ["external-secret-resolution-smoke", "provider-health-secretRefs-smoke"]
        },
        config: {
          keyId: "medical-record-agent-key",
          region: "cn-hangzhou"
        }
      })
    );
    await expect(resolver.resolve("medical/ocr/api-key")).resolves.toEqual({
      resolved: false,
      source: "kms",
      reason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED"
    });
  });

  it("Vault/KMS/Secret Manager resolver skeleton 支持注入 mock client 且失败时只返回脱敏 blocked reason", async () => {
    const vaultClient = {
      readSecret: vi.fn(async (ref: string) => (ref === "kv/medical/ocr" ? "vault-ocr-token" : null))
    };
    const kmsClient = {
      decryptSecretRef: vi.fn(async (ref: string) => (ref === "ciphertext://medical/llm" ? "kms-llm-token" : null))
    };
    const secretManagerClient = {
      accessSecretVersion: vi.fn(async (ref: string) => (ref === "lims-api-token/latest" ? "sm-lims-token" : null))
    };

    const vaultResolver = createVaultSecretResolver({
      env: {
        SECRET_RESOLVER_PROVIDER: "vault",
        VAULT_ADDR: "https://vault.example.test",
        VAULT_TOKEN: "vault-token-should-not-leak"
      },
      client: vaultClient
    });
    const kmsResolver = createKmsSecretResolver({
      env: {
        SECRET_RESOLVER_PROVIDER: "kms",
        KMS_KEY_ID: "medical-record-agent-key",
        KMS_REGION: "cn-hangzhou"
      },
      client: kmsClient
    });
    const secretManagerResolver = createSecretManagerResolver({
      env: {
        SECRET_RESOLVER_PROVIDER: "secret-manager",
        SECRET_MANAGER_PROJECT: "medical-record-agent",
        SECRET_MANAGER_REGION: "cn-hangzhou"
      },
      client: secretManagerClient
    });

    await expect(vaultResolver.resolve("kv/medical/ocr")).resolves.toEqual({
      resolved: true,
      value: "vault-ocr-token",
      source: "vault"
    });
    await expect(kmsResolver.resolve("ciphertext://medical/llm")).resolves.toEqual({
      resolved: true,
      value: "kms-llm-token",
      source: "kms"
    });
    await expect(secretManagerResolver.resolve("lims-api-token/latest")).resolves.toEqual({
      resolved: true,
      value: "sm-lims-token",
      source: "secret-manager"
    });
    await expect(vaultResolver.resolve("kv/medical/missing")).resolves.toEqual({
      resolved: false,
      source: "vault",
      reason: "SECRET_NOT_FOUND"
    });

    const blockedVaultResolver = createVaultSecretResolver({
      env: {
        SECRET_RESOLVER_PROVIDER: "vault",
        VAULT_ADDR: "https://vault.example.test",
        VAULT_TOKEN: "vault-token-should-not-leak"
      }
    });
    await expect(blockedVaultResolver.resolve("kv/medical/ocr")).resolves.toEqual({
      resolved: false,
      source: "vault",
      reason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED"
    });
    expect(JSON.stringify(blockedVaultResolver.contract)).not.toContain("vault-token-should-not-leak");
  });

  it("生产队列 contract 明确 in-process 只能用于单实例本地闭环", () => {
    expect(buildProductionQueueContract({})).toEqual({
      mode: "in-process",
      productionReady: false,
      blockedReason: "QUEUE_BROKER_NOT_CONFIGURED",
      requiredExternal: ["broker", "lease", "retry", "deadLetter", "heartbeat", "statusResultConsistency", "multiInstanceSmoke"],
      readiness: {
        nextAction:
          "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
        requiredChecks: [
          "multi-worker-lease-smoke",
          "retry-dead-letter-smoke",
          "heartbeat-status-consistency-smoke",
          "status-result-consistency-smoke",
          "idempotency-key-deduplication-smoke"
        ]
      },
      config: {},
      configReady: false
    });
  });

  it("生产 broker 队列缺少持久化可靠性配置时 fail-fast", () => {
    const contract = buildProductionQueueContract({
      QUEUE_MODE: "broker",
      QUEUE_BROKER_PROVIDER: "redis",
      QUEUE_BROKER_URL: "redis://queue.example.test:6379",
      QUEUE_NAME: "medical-recognition-jobs"
    });

    expect(contract).toEqual(
      expect.objectContaining({
        mode: "broker",
        productionReady: false,
        configReady: false,
        blockedReason: "QUEUE_BROKER_CONTRACT_INCOMPLETE",
        missingKeys: ["QUEUE_VISIBILITY_TIMEOUT_MS", "QUEUE_RETRY_LIMIT", "QUEUE_DEAD_LETTER_QUEUE"]
      })
    );
    expect(() => assertProductionQueueContract(contract)).toThrow(/QUEUE_BROKER_CONTRACT_INCOMPLETE/);
  });

  it("生产 broker 队列配置完整但没有真实 adapter 时仍保持 blocked，不伪造 broker 通过", () => {
    const contract = buildProductionQueueContract({
      QUEUE_MODE: "broker",
      QUEUE_BROKER_PROVIDER: "redis",
      QUEUE_BROKER_URL: "redis://queue.example.test:6379",
      QUEUE_NAME: "medical-recognition-jobs",
      QUEUE_VISIBILITY_TIMEOUT_MS: "30000",
      QUEUE_RETRY_LIMIT: "3",
      QUEUE_DEAD_LETTER_QUEUE: "medical-recognition-jobs-dlq",
      WORKER_CONCURRENCY: "4"
    });

    expect(contract).toEqual({
      mode: "broker",
      productionReady: false,
      configReady: true,
      blockedReason: "QUEUE_BROKER_ADAPTER_NOT_CONNECTED",
      requiredExternal: ["broker", "lease", "retry", "deadLetter", "heartbeat", "statusResultConsistency", "multiInstanceSmoke"],
      readiness: {
        nextAction:
          "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency smoke。",
        requiredChecks: [
          "multi-worker-lease-smoke",
          "retry-dead-letter-smoke",
          "heartbeat-status-consistency-smoke",
          "status-result-consistency-smoke",
          "idempotency-key-deduplication-smoke"
        ]
      },
      config: {
        brokerProvider: "redis",
        brokerUrl: "redis://queue.example.test:6379",
        queueName: "medical-recognition-jobs",
        visibilityTimeoutMs: 30000,
        retryLimit: 3,
        deadLetterQueue: "medical-recognition-jobs-dlq",
        workerConcurrency: 4
      }
    });
    expect(() => assertProductionQueueContract(contract)).toThrow(/QUEUE_BROKER_ADAPTER_NOT_CONNECTED/);
  });

  it("生产 session invalidation store 缺集中化配置时保持 blocked", () => {
    expect(buildProductionSessionInvalidationStoreContract({})).toEqual({
      mode: "in-memory",
      productionReady: false,
      configReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_IN_MEMORY",
      requiredExternal: ["database", "redis", "multiInstanceSmoke"],
      readiness: {
        nextAction:
          "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      },
      config: {}
    });
  });

  it("生产 session invalidation store 配置 repository 但未接 adapter 时保持 blocked", () => {
    const contract = buildProductionSessionInvalidationStoreContract({
      SESSION_INVALIDATION_STORE_MODE: "repository",
      SESSION_INVALIDATION_STORE_PROVIDER: "database",
      SESSION_INVALIDATION_TTL_MS: "86400000"
    });

    expect(contract).toEqual({
      mode: "repository",
      productionReady: false,
      configReady: true,
      blockedReason: "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED",
      requiredExternal: ["database", "redis", "multiInstanceSmoke"],
      readiness: {
        nextAction:
          "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      },
      config: {
        provider: "database",
        invalidationTtlMs: 86400000
      }
    });
  });

  it("生产 session invalidation store 注入 repository 后仍要求真实多实例 smoke", async () => {
    const rows = new Map<string, { tokenHash: string; invalidatedAt: Date; expiresAt: Date }>();
    const repository = {
      upsertInvalidatedSession: vi.fn(async (input: { tokenHash: string; invalidatedAt: Date; expiresAt: Date }) => {
        rows.set(input.tokenHash, input);
      }),
      findInvalidatedSession: vi.fn(async (input: { tokenHash: string; now: Date }) => {
        const row = rows.get(input.tokenHash);
        return row && row.expiresAt > input.now ? row : null;
      })
    };
    const store = createProductionSessionInvalidationStore({
      env: {
        SESSION_INVALIDATION_STORE_MODE: "repository",
        SESSION_INVALIDATION_STORE_PROVIDER: "database",
        SESSION_INVALIDATION_TTL_MS: "86400000"
      },
      repository,
      now: () => new Date("2026-06-09T09:00:00.000Z")
    });

    if (!store) {
      throw new Error("Expected repository-backed session invalidation store");
    }

    await store.invalidate("raw.jwt.session");

    expect(store.describe()).toEqual({
      adapter: "repository",
      provider: "database",
      productionReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
      capabilities: {
        centralized: true,
        durable: true,
        multiInstance: true,
        tokenHashing: true,
        ttl: true
      },
      readiness: {
        nextAction:
          "运行至少两个 API 实例的登出/轮换失效 smoke，确认共享 store 只保存 token hash 和 TTL。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      },
      policy: {
        invalidationTtlMs: 86400000
      }
    });
    expect(JSON.stringify([...rows.values()])).not.toContain("raw.jwt.session");
    await expect(store.isInvalidated("raw.jwt.session")).resolves.toBe(true);
  });

  it("生产 session invalidation store 可用 database delegate 创建 adapter skeleton，但仍要求真实多实例 smoke", async () => {
    const rows = new Map<string, { tokenHash: string; invalidatedAt: Date; expiresAt: Date }>();
    const delegate = {
      upsert: vi.fn(async (input) => {
        rows.set(input.where.tokenHash, input.create);
        return input.create;
      }),
      findFirst: vi.fn(async (input) => {
        const row = rows.get(input.where.tokenHash);
        return row && row.expiresAt > input.where.expiresAt.gt ? row : null;
      })
    };
    const store = createProductionSessionInvalidationStore({
      env: {
        SESSION_INVALIDATION_STORE_MODE: "repository",
        SESSION_INVALIDATION_STORE_PROVIDER: "database",
        SESSION_INVALIDATION_TTL_MS: "60000"
      },
      databaseDelegate: delegate,
      now: () => new Date("2026-06-09T09:00:00.000Z")
    });

    if (!store) {
      throw new Error("Expected database-backed session invalidation store");
    }

    await store.invalidate("raw.jwt.database-session");

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      create: {
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        invalidatedAt: new Date("2026-06-09T09:00:00.000Z"),
        expiresAt: new Date("2026-06-09T09:01:00.000Z")
      },
      update: {
        invalidatedAt: new Date("2026-06-09T09:00:00.000Z"),
        expiresAt: new Date("2026-06-09T09:01:00.000Z")
      }
    });
    expect(JSON.stringify([...rows.values()])).not.toContain("raw.jwt.database-session");
    expect(store.describe()).toMatchObject({
      adapter: "repository",
      provider: "database",
      productionReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN"
    });
  });

  it("生产 session invalidation store 可用 Redis client 创建 adapter skeleton，但仍要求真实多实例 smoke", async () => {
    const redisRows = new Map<string, string>();
    const redisClient = {
      set: vi.fn(async (key: string, value: string, options?: { px?: number }) => {
        redisRows.set(key, JSON.stringify({ value, options }));
        return "OK" as const;
      }),
      get: vi.fn(async (key: string) => redisRows.get(key) ?? null)
    };
    const store = createProductionSessionInvalidationStore({
      env: {
        SESSION_INVALIDATION_STORE_MODE: "repository",
        SESSION_INVALIDATION_STORE_PROVIDER: "redis",
        SESSION_INVALIDATION_TTL_MS: "120000",
        SESSION_INVALIDATION_REDIS_KEY_PREFIX: "mra:prod:test:"
      },
      redisClient,
      now: () => new Date("2026-06-09T09:00:00.000Z")
    });

    if (!store) {
      throw new Error("Expected Redis-backed session invalidation store");
    }

    await store.invalidate("raw.jwt.redis-session");

    expect(redisClient.set).toHaveBeenCalledWith(expect.stringMatching(/^mra:prod:test:[a-f0-9]{64}$/u), expect.stringMatching(/^[a-f0-9]{64}$/u), {
      px: 120000
    });
    expect(JSON.stringify([...redisRows.entries()])).not.toContain("raw.jwt.redis-session");
    expect(store.describe()).toMatchObject({
      adapter: "repository",
      provider: "redis",
      productionReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN"
    });
  });

  it("Redis broker adapter factory 有 mock client 时返回 skeleton，但真实 broker smoke 前仍不标记生产通过", () => {
    const redisClient = {
      rpush: vi.fn(async () => 1),
      lpop: vi.fn(async () => null),
      lrange: vi.fn(async () => []),
      set: vi.fn(async () => "OK" as const),
      get: vi.fn(async () => null),
      del: vi.fn(async () => 0),
      pexpire: vi.fn(async () => 1)
    };

    const adapter = createProductionJobQueueAdapter({
      env: {
        QUEUE_MODE: "broker",
        QUEUE_BROKER_PROVIDER: "redis",
        QUEUE_BROKER_URL: "redis://queue.example.test:6379",
        QUEUE_NAME: "medical-recognition-jobs",
        QUEUE_VISIBILITY_TIMEOUT_MS: "30000",
        QUEUE_RETRY_LIMIT: "3",
        QUEUE_DEAD_LETTER_QUEUE: "medical-recognition-jobs-dlq"
      },
      redisClient
    });

    expect(adapter?.describe()).toEqual(
      expect.objectContaining({
        adapter: "broker",
        brokerProvider: "redis",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_SMOKE_NOT_RUN"
      })
    );
    expect(createProductionJobQueueAdapter({ env: { QUEUE_MODE: "broker", QUEUE_BROKER_PROVIDER: "redis" } })).toBeUndefined();
  });

  it("生产服务装配可注入 Redis queue client，但 status 仍明确真实 broker smoke blocked", () => {
    const redisQueueClient = {
      rpush: vi.fn(async () => 1),
      lpop: vi.fn(async () => null),
      lrange: vi.fn(async () => []),
      set: vi.fn(async () => "OK" as const),
      get: vi.fn(async () => null),
      del: vi.fn(async () => 0),
      pexpire: vi.fn(async () => 1)
    };
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: createPrismaClientStub() as never,
      redisQueueClient,
      queueEnv: {
        QUEUE_MODE: "broker",
        QUEUE_BROKER_PROVIDER: "redis",
        QUEUE_BROKER_URL: "redis://queue.example.test:6379",
        QUEUE_NAME: "medical-recognition-jobs",
        QUEUE_VISIBILITY_TIMEOUT_MS: "30000",
        QUEUE_RETRY_LIMIT: "3",
        QUEUE_DEAD_LETTER_QUEUE: "medical-recognition-jobs-dlq"
      }
    });

    const queue = services.jobQueue;
    if (!queue?.describe) {
      throw new Error("Expected production Redis queue adapter to be configured");
    }
    expect(queue.describe()).toEqual(
      expect.objectContaining({
        adapter: "broker",
        brokerProvider: "redis",
        productionReady: false,
        blockedReason: "QUEUE_BROKER_SMOKE_NOT_RUN"
      })
    );
  });

  it("保存的 HTTP provider 健康检查在 secretRef 无法解析时只返回 provider key、secretRef 和 blocked reason", async () => {
    const prisma = createPrismaClientStub();
    vi.mocked(prisma.providerConfig.findUnique).mockResolvedValueOnce({
      id: "provider-http-ocr-001",
      key: "saved-http-ocr",
      kind: "ocr",
      displayName: "保存的 HTTP OCR",
      status: "active",
      isDefault: false,
      config: {
        providerKind: "http",
        endpoint: "http://ocr.vendor.example/recognize"
      },
      secretRefs: {
        apiKey: "OCR_VENDOR_TOKEN"
      },
      updatedById: "user-001",
      createdAt: new Date("2026-06-05T08:00:00.000Z"),
      updatedAt: new Date("2026-06-05T08:00:00.000Z")
    });
    const healthFetch = vi.fn();
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      providerHealthFetch: healthFetch,
      secretResolver: createEnvSecretResolver({
        env: {}
      }),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const health = await services.providerService.checkProviderHealth({
      key: "saved-http-ocr",
      actor: createProviderManagerActor()
    });

    expect(healthFetch).not.toHaveBeenCalled();
    expect(JSON.stringify(health)).not.toContain("resolved-ocr-secret");
    expect(health).toEqual(
      expect.objectContaining({
        key: "saved-http-ocr",
        kind: "ocr",
        status: "blocked",
        blockedReason: "SECRET_NOT_FOUND",
        secretDiagnostics: {
          apiKey: {
            secretRef: "OCR_VENDOR_TOKEN",
            source: "env",
            resolved: false,
            blockedReason: "SECRET_NOT_FOUND"
          }
        },
        secretRefs: {
          apiKey: "OCR_VENDOR_TOKEN"
        }
      })
    );
  });

  it("保存的 HTTP OCR provider 会用 secretRefs 经 resolver 注入 Authorization", async () => {
    const prisma = createPrismaClientStub();
    const providerRuntimeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pages: [
            {
              page: 1,
              text: "临床诊断：肺腺癌。",
              confidence: 0.99,
              blocks: [
                {
                  blockId: "ocr-block-1",
                  text: "临床诊断：肺腺癌。",
                  confidence: 0.99,
                  coordinates: { x: 0, y: 0, width: 100, height: 20 }
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.mocked(prisma.providerConfig.findUnique).mockImplementation(async (input) => {
      if (input.where.key !== "saved-http-ocr") {
        return null;
      }

      return {
        id: "provider-http-ocr-001",
        key: "saved-http-ocr",
        kind: "ocr",
        displayName: "保存的 HTTP OCR",
        status: "active",
        isDefault: false,
        config: {
          providerKind: "http",
          endpoint: "http://ocr.vendor.example/recognize"
        },
        secretRefs: {
          apiKey: "OCR_VENDOR_TOKEN"
        },
        updatedById: "user-001",
        createdAt: new Date("2026-06-05T08:00:00.000Z"),
        updatedAt: new Date("2026-06-05T08:00:00.000Z")
      };
    });
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: providerRuntimeFetch as unknown as typeof fetch,
      openAiResponsesClient: createOpenAiResponsesClientStub(),
      secretResolver: createEnvSecretResolver({
        env: {
          OCR_VENDOR_TOKEN: "resolved-ocr-secret"
        }
      }),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-http-ocr-secret",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("DEMO_PDF_BYTES")
      },
      providerConfig: {
        ocrProviderKey: "saved-http-ocr"
      }
    });
    await drainProductionJobs(services);

    expect(providerRuntimeFetch).toHaveBeenCalledWith(
      "http://ocr.vendor.example/recognize",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer resolved-ocr-secret"
        })
      })
    );
    expect(JSON.stringify(prisma.recognitionResult.upsert.mock.calls)).not.toContain("resolved-ocr-secret");
  });

  it("保存的 HTTP LLM provider 会用 secretRefs 经 resolver 注入模型 apiKey", async () => {
    const prisma = createPrismaClientStub();
    const providerRuntimeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("ocr.example.test")) {
        return createProviderRuntimeFetchStub()(url, init);
      }

      const body = JSON.parse(String(init?.body ?? "{}"));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fields: [
                    {
                      fieldKey: "clinicalDiagnosis",
                      value: "肺腺癌",
                      rawValue: "诊断：肺腺癌",
                      confidence: 0.96,
                      evidence: [
                        {
                          snippet: "诊断：肺腺癌",
                          startOffset: 0,
                          endOffset: 6,
                          pageNumber: 1
                        }
                      ]
                    }
                  ]
                })
              }
            }
          ],
          model: body.model
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.mocked(prisma.providerConfig.findUnique).mockImplementation(async (input) => {
      if (input.where.key !== "saved-http-model") {
        return null;
      }

      return {
        id: "provider-http-llm-001",
        key: "saved-http-model",
        kind: "llm",
        displayName: "保存的 HTTP LLM",
        status: "active",
        isDefault: false,
        config: {
          providerKind: "openai-compatible",
          endpoint: "http://llm.vendor.example/v1/chat/completions",
          model: "vendor-medical-model"
        },
        secretRefs: {
          apiKey: "LLM_VENDOR_TOKEN"
        },
        updatedById: "user-001",
        createdAt: new Date("2026-06-05T08:00:00.000Z"),
        updatedAt: new Date("2026-06-05T08:00:00.000Z")
      };
    });
    const services = createProductionApiServices({
      env: createProductionEnvWithRealProvidersStub(),
      prisma: prisma as never,
      providerRuntimeFetch: providerRuntimeFetch as unknown as typeof fetch,
      secretResolver: createEnvSecretResolver({
        env: {
          LLM_VENDOR_TOKEN: "resolved-llm-secret"
        }
      }),
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: createSyntheticRecognitionDocument("demo-document-http-llm-secret"),
      providerConfig: {
        providerKey: "saved-http-model"
      }
    });
    await drainProductionJobs(services);

    expect(providerRuntimeFetch).toHaveBeenCalledWith(
      "http://llm.vendor.example/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer resolved-llm-secret"
        })
      })
    );
    expect(JSON.stringify(prisma.recognitionResult.upsert.mock.calls)).not.toContain("resolved-llm-secret");
  });
});

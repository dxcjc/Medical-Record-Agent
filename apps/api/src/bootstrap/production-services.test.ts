import { describe, expect, it, vi } from "vitest";

import { createProductionApiServices } from "./production-services";

type ProductionApiServicesOptions = Parameters<typeof createProductionApiServices>[0];
type ProductionEnvStub = ProductionApiServicesOptions["env"];

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
      findFirst: vi.fn(async (): Promise<Record<string, unknown> | null> => null)
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
      update: vi.fn(async (input) => ({
        id: input.where.id,
        ...input.data
      }))
    },
    recognitionResult: {
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
      }))
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
            deidentified: true
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
      }))
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
        provider: "mock" as const,
        endpoint: undefined,
        apiKey: undefined
      },
      llm: {
        provider: "mock" as const,
        model: "mock-medical-record-extractor",
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

function createProviderManagerActor() {
  return {
    actorUserId: "user-001",
    authType: "jwt" as const,
    permissions: ["provider:manage"],
    roles: ["admin"]
  };
}

describe("production api services bootstrap", () => {
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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(services.providerService.listProviders()).resolves.toEqual([
      expect.objectContaining({
        key: "mock-ocr",
        kind: "ocr",
        secretRefs: {}
      }),
      expect.objectContaining({
        key: "mock-model",
        kind: "llm",
        secretRefs: {}
      }),
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

    await services.writebackService.execute({
      jobId: "job-001",
      payload: {
        clinicalInfo: {
          clinicalDiagnosis: "DEMO_DIAGNOSIS"
        }
      },
      idempotencyKey: "job-001:manual"
    });

    expect(limsAdapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "writeback-001",
        recognitionResultId: "job-001",
        limsSampleId: "job-001",
        requestedByUserId: "system",
        idempotencyKey: "job-001:manual",
        payload: {
          clinicalInfo: {
            clinicalDiagnosis: "DEMO_DIAGNOSIS"
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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-001",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const job = await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-auto-writeback",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

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
        status: "writeback_completed"
      })
    );
  });

  it("生产识别任务会拒绝当前环境未配置的 providerConfig，避免静默落回默认 provider", async () => {
    const prisma = createPrismaClientStub();
    const services = createProductionApiServices({
      env: createProductionEnvStub(),
      prisma: prisma as never,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-provider-config",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      },
      providerConfig: {
        ocrProviderKey: "missing-ocr",
        providerKey: "missing-model"
      }
    });

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

  it("生产 LangChain provider 未注入真实模型时会启动期失败，避免空候选伪成功", () => {
    const env = createProductionEnvStub();
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
      langChainModel: {
        withStructuredOutput
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-langchain",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

    expect(withStructuredOutput).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(expect.stringContaining("字段"));
    expect(JSON.stringify(prisma.recognitionResult.upsert.mock.calls)).toContain("langchain-structured-output");
  });

  it("生产 OpenAI Responses provider 使用注入的真实 SDK client 形状而不是占位 throw", async () => {
    const prisma = createPrismaClientStub();
    const env = createProductionEnvStub();
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
      openAiResponsesClient: {
        responses: {
          create: responsesCreate
        }
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      document: {
        documentId: "demo-document-openai-responses",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "custom-clinical-schema",
      document: {
        documentId: "demo-document-schema-config",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      limsWritebackAdapter: limsAdapter,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.jobService.create({
      schemaKey: "custom-clinical-schema",
      document: {
        documentId: "demo-document-custom-schema",
        fileName: "demo-record.pdf",
        mimeType: "application/pdf"
      }
    });

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
      env: createProductionEnvStub(),
      prisma: prisma as never,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const run = await services.evaluationService.createRun({
      datasetId: "dataset-001",
      providerKey: "mock-model",
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
          sourceFileId: "file-001",
          createdById: "user-001",
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
      checksumSha256: "sha-demo",
      contentBase64: Buffer.from("DEMO_PDF_BYTES").toString("base64")
    });

    expect(storageProvider.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "uploads/2026-06-05/record.pdf",
        body: Buffer.from("DEMO_PDF_BYTES"),
        contentType: "application/pdf"
      })
    );
    expect(prisma.storedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: "uploads/2026-06-05/record.pdf",
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
        method: "HEAD",
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
          method: "HEAD",
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
          method: "HEAD",
          url: "http://ocr.internal/api/recognize"
        })
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
});

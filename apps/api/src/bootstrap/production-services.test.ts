import { describe, expect, it, vi } from "vitest";

import { createProductionApiServices } from "./production-services";

function createPrismaClientStub() {
  return {
    user: {},
    apiToken: {},
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    schemaDraft: {},
    schemaVersion: {},
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

function createProductionEnvStub() {
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
      })
    ]);

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
});

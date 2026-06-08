import { describe, expect, it, vi } from "vitest";

import type { SchemaRouteService } from "../routes/schemas.routes";
import { createApiServices, type ApiServiceRepositories } from "./api-services";

function createRepositories(): ApiServiceRepositories {
  return {
    schemaRepository: {
      listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info", version: 1 }])
    },
    fileRepository: {
      create: vi.fn(async (input) => ({ id: "file-001", ...input })),
      findById: vi.fn(async () => ({
        id: "file-001",
        storageKey: "uploads/2026-06-05/record.pdf",
        originalName: "record.pdf",
        mimeType: "application/pdf"
      }))
    },
    jobsRepository: {
      create: vi.fn(async (input) => ({ id: "job-001", status: "queued", ...input })),
      findById: vi.fn(async () => ({ id: "job-001", status: "completed", sourceFileId: "file-001" })),
      listEligibleForWriteback: vi.fn(async () => [])
    },
    resultsRepository: {
      findByJobId: vi.fn(async () => ({ jobId: "job-001", fields: [] })),
      upsertByJobId: vi.fn(async (input) => ({ id: "result-001", ...input }))
    },
    feedbackRepository: {
      create: vi.fn(async (input) => ({ id: "feedback-001", ...input }))
    },
    writebackRepository: {
      create: vi.fn(async (input) => ({ id: "writeback-001", ...input })),
      complete: vi.fn(async (_id, input) => ({ id: "writeback-001", ...input }))
    },
    evaluationRepository: {
      listDatasets: vi.fn(async () => [{ id: "dataset-001", displayName: "评估集" }]),
      createDataset: vi.fn(async (input) => ({ id: "dataset-001", ...input })),
      findDatasetById: vi.fn(async () => ({ id: "dataset-001", deidentified: true })),
      addSample: vi.fn(async (input) => ({ id: "sample-001", ...input })),
      listSamples: vi.fn(async () => [
        {
          id: "sample-001",
          datasetId: "dataset-001",
          groundTruth: {
            clinicalDiagnosis: {
              value: "DEMO_DIAGNOSIS_A",
              normalizedValue: "DEMO_DIAGNOSIS_A"
            }
          },
          metadata: {
            sourceType: "synthetic",
            deidentified: true,
            evaluationInput: {
              sourceType: "synthetic",
              fileName: "synthetic-001.json",
              predictedValue: "肺腺癌?"
            }
          }
        }
      ]),
      listRunsByDataset: vi.fn(async () => [{ id: "run-001", datasetId: "dataset-001" }]),
      createRun: vi.fn(async (input) => ({ id: "run-001", status: "queued", ...input })),
      markRunStarted: vi.fn(async (id, startedAt) => ({ id, status: "running", startedAt })),
      completeRun: vi.fn(async (id, input) => ({ id, ...input })),
      upsertMetric: vi.fn(async (input) => ({ id: `metric-${input.name}`, ...input })),
      findRunById: vi.fn(async () => ({ id: "run-001", status: "queued" })),
      listMetrics: vi.fn(async () => [{ name: "field_accuracy", value: 0.91 }])
    }
  };
}

function createSchemaService(): SchemaRouteService {
  // 组合层测试只验证 service 注入边界，不在这里重复 Schema Studio 的业务测试。
  return {
    listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info", version: 1 }]),
    createDraft: vi.fn(async (input) => ({ id: "draft-001", ...input })),
    updateDraft: vi.fn(async (input) => ({ id: input.id, definition: input.definition, status: "draft" })),
    validateDraft: vi.fn(async () => ({ valid: true, errors: [] })),
    publishDraft: vi.fn(async (input) => ({ id: "version-002", draftId: input.id, version: 2 })),
    deactivateVersion: vi.fn(async (input) => ({ id: input.id, status: "inactive" })),
    rollbackVersion: vi.fn(async (input) => ({ id: input.id, status: "active" })),
    compareVersions: vi.fn(async (input) => ({
      schemaKey: input.schemaKey,
      changedVersion: {
        left: 1,
        right: 2
      },
      fields: {
        added: [],
        removed: [],
        unchanged: []
      }
    }))
  };
}

function createEvaluationServiceForTest(repositories = createRepositories()) {
  // 评估样本导入的安全门只依赖 evaluationRepository；其它依赖保持最小 mock，避免测试把注意力分散到无关服务。
  const services = createApiServices({
    authService: {
      login: vi.fn(),
      authenticateJwt: vi.fn(),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    },
    auditService: {
      listRecent: vi.fn(),
      record: vi.fn()
    },
    schemaService: createSchemaService(),
    repositories,
    recognitionOrchestrator: {
      start: vi.fn()
    },
    providerRegistry: {
      list: vi.fn(),
      setDefault: vi.fn()
    }
  });

  return {
    repositories,
    evaluationService: services.evaluationService
  };
}

const evaluationActor = {
  actorUserId: "user-001",
  authType: "jwt" as const,
  permissions: ["evaluation:manage"],
  roles: ["admin"]
};

describe("api service composition", () => {
  it("把 repositories、core orchestrator 和 provider registry 组合成 API services", async () => {
    const repositories = createRepositories();
    const recognitionOrchestrator = {
      start: vi.fn(async () => ({
        jobId: "job-001",
        status: "completed",
        trace: [],
        validation: {
          decision: "accepted",
          fieldResults: [],
          missingRequiredFieldKeys: [],
          acceptedFieldKeys: [],
          reviewFieldKeys: [],
          normalizedCandidates: []
        },
        autoDecision: {
          decision: "green",
          shouldWriteback: false,
          reasons: []
        },
        writeback: {
          ready: false,
          readyFields: [],
          blockers: []
        },
        extraction: {
          candidates: []
        }
      }))
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator,
      providerRegistry: {
        list: vi.fn(async () => [{ key: "mock", secretRefs: { apiKey: "secret" } }]),
        setDefault: vi.fn(async (key) => ({ key, isDefault: true })),
        checkHealth: vi.fn(async (key) => ({
          key,
          status: "healthy" as const,
          checkedAt: "2026-06-05T09:00:00.000Z",
          message: "provider reachable"
        }))
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.fileService.createUpload({
      originalName: "record.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      checksumSha256: "sha-demo"
    });
    expect(repositories.fileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: expect.stringContaining("uploads/"),
        byteSize: BigInt(1024)
      })
    );

    const job = await services.jobService.create({
      schemaKey: "lims-clinical-info",
      sourceFileId: "file-001",
      document: {
        documentId: "file-001"
      },
      providerConfig: {
        ocrProviderKey: "mock-ocr",
        providerKey: "mock-model"
      }
    });
    expect(repositories.jobsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001",
        providerConfig: {
          ocrProviderKey: "mock-ocr",
          providerKey: "mock-model"
        }
      })
    );
    expect(recognitionOrchestrator.start).toHaveBeenCalledWith({
      jobId: "job-001",
      schemaKey: "lims-clinical-info",
      document: expect.objectContaining({
        documentId: "file-001"
      }),
      providerConfig: {
        ocrProviderKey: "mock-ocr",
        providerKey: "mock-model"
      }
    });
    expect(repositories.resultsRepository.upsertByJobId).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001",
        fields: [],
        reviewRequired: false
      })
    );
    expect(job).toEqual(expect.objectContaining({ id: "job-001", status: "completed" }));

    await services.writebackService.execute({
      jobId: "job-001",
      payload: {
        clinicalInfo: {
          clinicalDiagnosis: "演示诊断"
        }
      }
    });
    expect(repositories.writebackRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001",
        targetSystem: "lims"
      })
    );
    expect(repositories.writebackRepository.complete).toHaveBeenCalledWith(
      "writeback-001",
      expect.objectContaining({
        status: "succeeded"
      })
    );

    await services.providerService.setDefaultProvider({
      key: "mock",
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["provider:manage"],
        roles: ["admin"]
      }
    });
    await expect(services.providerService.listProviders()).resolves.toEqual([
      { key: "mock", secretRefs: { apiKey: "secret" } }
    ]);
    await expect(
      services.providerService.checkProviderHealth({
        key: "mock",
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["provider:manage"],
          roles: ["admin"]
        }
      })
    ).resolves.toEqual({
      key: "mock",
      status: "healthy",
      checkedAt: "2026-06-05T09:00:00.000Z",
      message: "provider reachable"
    });

    await services.evaluationService.createRun({
      datasetId: "dataset-001",
      providerKey: "mock",
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });
    expect(repositories.evaluationRepository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset-001",
        createdById: "user-001",
        providerConfig: {
          providerKey: "mock"
        }
      })
    );

    await services.evaluationService.createDataset({
      key: "lims-ci-v1",
      displayName: "LIMS 合成评估集",
      deidentified: true,
      metadata: {
        sourceType: "synthetic"
      },
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });
    expect(repositories.evaluationRepository.createDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "lims-ci-v1",
        displayName: "LIMS 合成评估集",
        deidentified: true,
        metadata: {
          sourceType: "synthetic"
        }
      })
    );

    await services.evaluationService.importSamples({
      datasetId: "dataset-001",
      samples: [
        {
          externalId: "synthetic-001",
          input: {
            sourceType: "synthetic",
            fileName: "synthetic-001.json",
            predictedValue: "肺腺癌?"
          },
          metadata: {
            sourceType: "synthetic",
            deidentified: true
          },
          groundTruth: [
            {
              fieldKey: "clinicalDiagnosis",
              value: "肺腺癌"
            }
          ]
        }
      ],
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });
    expect(repositories.evaluationRepository.addSample).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset-001",
        externalId: "synthetic-001",
        metadata: {
          sourceType: "synthetic",
          deidentified: true,
          evaluationInput: {
            sourceType: "synthetic",
            fileName: "synthetic-001.json",
            predictedValue: "肺腺癌?"
          }
        }
      })
    );
  });

  it("拒绝向未标记脱敏的数据集导入评估样本", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.evaluationRepository.findDatasetById).mockResolvedValueOnce({
      id: "dataset-unsafe",
      deidentified: false
    });
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      }
    });

    await expect(
      services.evaluationService.importSamples({
        datasetId: "dataset-unsafe",
        samples: [
          {
            metadata: {
              sourceType: "real_deidentified",
              deidentified: true
            },
            groundTruth: []
          }
        ],
        actor: {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["evaluation:manage"],
          roles: ["admin"]
        }
      })
    ).rejects.toMatchObject({
      code: "EVALUATION_DATASET_NOT_DEIDENTIFIED",
      statusCode: 409
    });
    expect(repositories.evaluationRepository.addSample).not.toHaveBeenCalled();
  });

  it("允许 synthetic 评估样本导入", async () => {
    const { repositories, evaluationService } = createEvaluationServiceForTest();

    await expect(
      evaluationService.importSamples({
        datasetId: "dataset-001",
        samples: [
          {
            externalId: "synthetic-safe-001",
            metadata: {
              sourceType: "synthetic"
            },
            groundTruth: []
          }
        ],
        actor: evaluationActor
      })
    ).resolves.toEqual([
      expect.objectContaining({
        externalId: "synthetic-safe-001"
      })
    ]);
    expect(repositories.evaluationRepository.addSample).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "synthetic-safe-001",
        metadata: {
          sourceType: "synthetic"
        }
      })
    );
  });

  it("拒绝 sourceType 为 real 的真实评估样本", async () => {
    const { repositories, evaluationService } = createEvaluationServiceForTest();

    await expect(
      evaluationService.importSamples({
        datasetId: "dataset-001",
        samples: [
          {
            metadata: {
              sourceType: "real",
              deidentified: true
            },
            groundTruth: []
          }
        ],
        actor: evaluationActor
      })
    ).rejects.toMatchObject({
      code: "EVALUATION_SAMPLE_REAL_SOURCE_TYPE_FORBIDDEN",
      statusCode: 409
    });
    expect(repositories.evaluationRepository.addSample).not.toHaveBeenCalled();
  });

  it("拒绝缺少脱敏证明的 real_deidentified 评估样本", async () => {
    const { repositories, evaluationService } = createEvaluationServiceForTest();

    await expect(
      evaluationService.importSamples({
        datasetId: "dataset-001",
        samples: [
          {
            metadata: {
              sourceType: "real_deidentified",
              deidentified: true
            },
            groundTruth: []
          }
        ],
        actor: evaluationActor
      })
    ).rejects.toMatchObject({
      code: "EVALUATION_SAMPLE_DEIDENTIFICATION_PROOF_REQUIRED",
      statusCode: 409
    });
    expect(repositories.evaluationRepository.addSample).not.toHaveBeenCalled();
  });

  it("允许带脱敏证明的 real_deidentified 评估样本导入并保留 metadata", async () => {
    const { repositories, evaluationService } = createEvaluationServiceForTest();

    await evaluationService.importSamples({
      datasetId: "dataset-001",
      samples: [
        {
          externalId: "real-deidentified-001",
          metadata: {
            sourceType: "real_deidentified",
            deidentified: true,
            deidentification: {
              proofId: "proof-20260608-001"
            }
          },
          groundTruth: []
        }
      ],
      actor: evaluationActor
    });

    expect(repositories.evaluationRepository.addSample).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "real-deidentified-001",
        metadata: {
          sourceType: "real_deidentified",
          deidentified: true,
          deidentification: {
            proofId: "proof-20260608-001"
          }
        }
      })
    );
  });

  it("创建评估 run 后执行 runner、持久化指标并完成 run", async () => {
    const repositories = createRepositories();
    const evaluationRunner = {
      run: vi.fn(async () => ({
        summary: {
          datasetId: "dataset-001",
          totalSamples: 1,
          completedSamples: 1,
          failedSamples: 0,
          totalFieldSamples: 1,
          startedAtMs: 1_000,
          finishedAtMs: 1_025,
          durationMs: 25
        },
        metrics: {
          sampleCount: 1,
          fieldAccuracy: 1,
          normalizedAccuracy: 1,
          evidenceCoverage: 1,
          needsReviewRecall: null,
          averageLatencyMs: 25
        },
        sampleResults: [],
        warnings: [],
        errors: []
      }))
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      evaluationRunner,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const run = await services.evaluationService.createRun({
      datasetId: "dataset-001",
      schemaKey: "custom-clinical-schema",
      providerKey: "mock-model",
      sampleLimit: 1,
      actor: {
        actorUserId: "user-001",
        authType: "jwt",
        permissions: ["evaluation:manage"],
        roles: ["admin"]
      }
    });

    expect(repositories.evaluationRepository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "dataset-001",
        createdById: "user-001",
        schemaConfig: {
          schemaKey: "custom-clinical-schema"
        },
        providerConfig: {
          providerKey: "mock-model"
        }
      })
    );
    expect(repositories.evaluationRepository.listSamples).toHaveBeenCalledWith("dataset-001", 1);
    expect(repositories.evaluationRepository.markRunStarted).toHaveBeenCalledWith(
      "run-001",
      new Date("2026-06-05T09:00:00.000Z")
    );
    expect(evaluationRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-001",
        dataset: expect.objectContaining({
          id: "dataset-001",
          samples: expect.arrayContaining([
            expect.objectContaining({
              id: "sample-001",
              input: {
                sourceType: "synthetic",
                fileName: "synthetic-001.json",
                predictedValue: "肺腺癌?"
              },
              deidentified: true
            })
          ]),
          deidentified: true
        }),
        schemaConfig: {
          schemaKey: "custom-clinical-schema"
        },
        providerConfig: {
          providerKey: "mock-model"
        }
      })
    );
    expect(repositories.evaluationRepository.upsertMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-001",
        name: "field_accuracy",
        value: 1,
        unit: "ratio"
      })
    );
    expect(repositories.evaluationRepository.upsertMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-001",
        name: "average_latency_ms",
        value: 25,
        unit: "ms"
      })
    );
    expect(repositories.evaluationRepository.completeRun).toHaveBeenCalledWith(
      "run-001",
      expect.objectContaining({
        status: "completed",
        summary: expect.objectContaining({
          datasetId: "dataset-001",
          totalSamples: 1
        }),
        completedAt: new Date("2026-06-05T09:00:00.000Z")
      })
    );
    expect(run).toEqual(
      expect.objectContaining({
        id: "run-001",
        status: "completed"
      })
    );
  });

  it("上传文件字节时如果没有配置 storageProvider 会拒绝创建文件记录", async () => {
    const repositories = createRepositories();
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.fileService.createUpload({
        originalName: "record.pdf",
        mimeType: "application/pdf",
        checksumSha256: "sha-demo",
        contentBase64: Buffer.from("DEMO_PDF_BYTES").toString("base64")
      })
    ).rejects.toMatchObject({
      code: "FILE_STORAGE_PROVIDER_NOT_CONFIGURED",
      statusCode: 503
    });

    expect(repositories.fileRepository.create).not.toHaveBeenCalled();
  });

  it("上传文件字节时会校验 SHA-256，不一致则拒绝创建文件记录", async () => {
    const repositories = createRepositories();
    const storageProvider = {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.fileService.createUpload({
        originalName: "record.pdf",
        mimeType: "application/pdf",
        checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        contentBase64: Buffer.from("DEMO_PDF_BYTES").toString("base64")
      })
    ).rejects.toMatchObject({
      code: "FILE_CHECKSUM_MISMATCH",
      statusCode: 409
    });

    expect(storageProvider.put).not.toHaveBeenCalled();
    expect(repositories.fileRepository.create).not.toHaveBeenCalled();
  });

  it("上传文件字节写入存储，并在创建识别任务时把字节交给 OCR 编排", async () => {
    const repositories = createRepositories();
    const storageProvider = {
      put: vi.fn(async (input) => ({
        key: input.key,
        size: input.body.byteLength,
        contentType: input.contentType
      })),
      get: vi.fn(async () => ({
        key: "uploads/2026-06-05/record.pdf",
        size: 14,
        contentType: "application/pdf",
        body: Buffer.from("DEMO_PDF_BYTES")
      })),
      delete: vi.fn()
    };
    const recognitionOrchestrator = {
      start: vi.fn(async () => ({
        jobId: "job-001",
        status: "completed",
        trace: [],
        validation: {
          fieldResults: [],
          normalizedCandidates: []
        },
        extraction: {
          candidates: []
        }
      }))
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator,
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await services.fileService.createUpload({
      originalName: "record.pdf",
      mimeType: "application/pdf",
      checksumSha256: "b66f1b66ec824925d01f389a3494722c0676af4d131cc3bd7d38b7c06bf62d61",
      contentBase64: Buffer.from("DEMO_PDF_BYTES").toString("base64"),
      metadata: {
        source: "unit-test"
      }
    });

    expect(storageProvider.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "uploads/2026-06-05/record.pdf",
        body: Buffer.from("DEMO_PDF_BYTES"),
        contentType: "application/pdf"
      })
    );
    expect(repositories.fileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: "uploads/2026-06-05/record.pdf",
        byteSize: BigInt(14),
        checksumSha256: "b66f1b66ec824925d01f389a3494722c0676af4d131cc3bd7d38b7c06bf62d61"
      })
    );

    await services.jobService.create({
      schemaKey: "lims-clinical-info",
      sourceFileId: "file-001"
    });

    expect(repositories.fileRepository.findById).toHaveBeenCalledWith("file-001");
    expect(storageProvider.get).toHaveBeenCalledWith("uploads/2026-06-05/record.pdf");
    expect(recognitionOrchestrator.start).toHaveBeenCalledWith({
      jobId: "job-001",
      schemaKey: "lims-clinical-info",
      document: expect.objectContaining({
        documentId: "file-001",
        fileName: "record.pdf",
        mimeType: "application/pdf",
        storageKey: "uploads/2026-06-05/record.pdf",
        content: Buffer.from("DEMO_PDF_BYTES")
      })
    });
  });

  it("创建识别任务前会校验 sourceFileId 对应的存储文件存在，避免生成无文件任务", async () => {
    const repositories = createRepositories();
    const recognitionOrchestrator = {
      start: vi.fn()
    };
    const storageProvider = {
      put: vi.fn(),
      get: vi.fn(async () => null),
      delete: vi.fn()
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator,
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.jobService.create({
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001"
      })
    ).rejects.toMatchObject({
      code: "STORED_FILE_NOT_FOUND",
      statusCode: 404
    });

    expect(repositories.fileRepository.findById).toHaveBeenCalledWith("file-001");
    expect(storageProvider.get).toHaveBeenCalledWith("uploads/2026-06-05/record.pdf");
    expect(repositories.jobsRepository.create).not.toHaveBeenCalled();
    expect(recognitionOrchestrator.start).not.toHaveBeenCalled();
  });

  it("创建识别任务前会校验 sourceFileId 对应的文件记录存在", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.fileRepository.findById).mockResolvedValueOnce(null);
    const recognitionOrchestrator = {
      start: vi.fn()
    };
    const storageProvider = {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator,
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    await expect(
      services.jobService.create({
        schemaKey: "lims-clinical-info",
        sourceFileId: "missing-file-001"
      })
    ).rejects.toMatchObject({
      code: "SOURCE_FILE_NOT_FOUND",
      statusCode: 404
    });

    expect(repositories.fileRepository.findById).toHaveBeenCalledWith("missing-file-001");
    expect(storageProvider.get).not.toHaveBeenCalled();
    expect(repositories.jobsRepository.create).not.toHaveBeenCalled();
    expect(recognitionOrchestrator.start).not.toHaveBeenCalled();
  });

  it("读取文件内容时通过文件仓库定位 storageKey 并返回受控存储字节", async () => {
    const repositories = createRepositories();
    const storageProvider = {
      put: vi.fn(),
      get: vi.fn(async () => ({
        key: "uploads/2026-06-05/record.pdf",
        body: Buffer.from("DEMO_PDF_BYTES"),
        size: Buffer.byteLength("DEMO_PDF_BYTES"),
        contentType: "application/pdf"
      })),
      delete: vi.fn()
    };
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      },
      storageProvider,
      now: () => new Date("2026-06-05T09:00:00.000Z")
    });

    const file = await services.fileService.getContent("file-001");

    expect(repositories.fileRepository.findById).toHaveBeenCalledWith("file-001");
    expect(storageProvider.get).toHaveBeenCalledWith("uploads/2026-06-05/record.pdf");
    expect(file).toEqual({
      id: "file-001",
      originalName: "record.pdf",
      mimeType: "application/pdf",
      body: Buffer.from("DEMO_PDF_BYTES")
    });
  });

  it("写回候选列表只返回已完成、无需复核且存在 readyFields 的任务摘要", async () => {
    const repositories = createRepositories();
    vi.mocked(repositories.jobsRepository.listEligibleForWriteback).mockResolvedValueOnce([
      {
        id: "job-eligible-001",
        status: "completed",
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001",
        result: {
          fields: [
            {
              fieldKey: "clinicalDiagnosis",
              value: "肺腺癌",
              confidence: 0.96
            }
          ],
          payload: {
            jobId: "job-eligible-001",
            source: {
              fileId: "file-001",
              ocrText: "这段 OCR 原文不能出现在候选列表响应里"
            },
            fields: [
              {
                fieldKey: "clinicalDiagnosis",
                value: "肺腺癌"
              }
            ],
            result: {
              status: "completed",
              reviewRequired: false
            },
            writeback: {
              readyFields: [
                {
                  fieldKey: "clinicalDiagnosis",
                  targetPath: "clinicalInfo.clinicalDiagnosis",
                  value: "肺腺癌"
                }
              ],
              blockers: []
            }
          },
          reviewRequired: false
        },
        writebacks: []
      },
      {
        id: "job-no-ready-fields",
        status: "completed",
        schemaKey: "lims-clinical-info",
        result: {
          fields: [],
          payload: {
            writeback: {
              readyFields: []
            }
          },
          reviewRequired: false
        },
        writebacks: []
      },
      {
        id: "job-needs-review",
        status: "completed",
        schemaKey: "lims-clinical-info",
        result: {
          fields: [],
          payload: {
            writeback: {
              readyFields: [{ fieldKey: "sampleType", value: "组织" }]
            }
          },
          reviewRequired: true
        },
        writebacks: []
      },
      {
        id: "job-running",
        status: "running",
        schemaKey: "lims-clinical-info",
        result: {
          fields: [],
          payload: {
            writeback: {
              readyFields: [{ fieldKey: "sampleType", value: "组织" }]
            }
          },
          reviewRequired: false
        },
        writebacks: []
      },
      {
        id: "job-already-succeeded",
        status: "completed",
        schemaKey: "lims-clinical-info",
        result: {
          fields: [],
          payload: {
            writeback: {
              readyFields: [{ fieldKey: "sampleType", value: "组织" }]
            }
          },
          reviewRequired: false
        },
        writebacks: [{ status: "succeeded" }]
      },
      {
        id: "job-failed-retryable",
        status: "confirmed",
        schemaKey: "lims-clinical-info",
        result: {
          fields: [{ fieldKey: "sampleType", value: "组织" }],
          payload: {
            writeback: {
              readyFields: [{ fieldKey: "sampleType", targetPath: "clinicalInfo.sampleType", value: "组织" }],
              blockers: [{ code: "PREVIOUS_ATTEMPT_FAILED" }]
            },
            result: {
              status: "completed"
            }
          },
          reviewRequired: false
        },
        writebacks: [{ status: "failed" }]
      }
    ]);
    const services = createApiServices({
      authService: {
        login: vi.fn(),
        authenticateJwt: vi.fn(),
        authenticateApiToken: vi.fn(),
        requirePermission: vi.fn()
      },
      auditService: {
        listRecent: vi.fn(),
        record: vi.fn()
      },
      schemaService: createSchemaService(),
      repositories,
      recognitionOrchestrator: {
        start: vi.fn()
      },
      providerRegistry: {
        list: vi.fn(),
        setDefault: vi.fn()
      }
    });
    const actor = {
      actorUserId: "user-001",
      authType: "jwt" as const,
      permissions: ["writeback:execute"],
      roles: ["operator"]
    };

    const items = await services.writebackService.listEligible({ actor, limit: 20 });

    expect(repositories.jobsRepository.listEligibleForWriteback).toHaveBeenCalledWith(20);
    expect(items).toEqual([
      {
        id: "job-eligible-001",
        jobId: "job-eligible-001",
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001",
        status: "completed",
        extractedFields: [
          {
            fieldKey: "clinicalDiagnosis",
            value: "肺腺癌",
            confidence: 0.96
          }
        ],
        readyFields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "肺腺癌"
          }
        ],
        blockers: [],
        payload: {
          jobId: "job-eligible-001",
          source: {
            fileId: "file-001"
          },
          fields: [
            {
              fieldKey: "clinicalDiagnosis",
              value: "肺腺癌"
            }
          ],
          result: {
            status: "completed",
            reviewRequired: false
          }
        }
      },
      {
        id: "job-failed-retryable",
        jobId: "job-failed-retryable",
        schemaKey: "lims-clinical-info",
        sourceFileId: null,
        status: "confirmed",
        extractedFields: [{ fieldKey: "sampleType", value: "组织" }],
        readyFields: [{ fieldKey: "sampleType", targetPath: "clinicalInfo.sampleType", value: "组织" }],
        blockers: [{ code: "PREVIOUS_ATTEMPT_FAILED" }],
        payload: {
          jobId: "job-failed-retryable",
          source: {
            fileId: null
          },
          fields: [{ fieldKey: "sampleType", value: "组织" }],
          result: {
            status: "completed"
          }
        }
      }
    ]);
    expect(JSON.stringify(items)).not.toContain("OCR 原文");
  });
});

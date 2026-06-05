import { describe, expect, it, vi } from "vitest";

import type { SchemaRouteService } from "../routes/schemas.routes";
import { createApiServices, type ApiServiceRepositories } from "./api-services";

function createRepositories(): ApiServiceRepositories {
  return {
    schemaRepository: {
      listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info", version: 1 }])
    },
    fileRepository: {
      create: vi.fn(async (input) => ({ id: "file-001", ...input }))
    },
    jobsRepository: {
      create: vi.fn(async (input) => ({ id: "job-001", status: "queued", ...input })),
      findById: vi.fn(async () => ({ id: "job-001", status: "completed", sourceFileId: "file-001" }))
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
      listRunsByDataset: vi.fn(async () => [{ id: "run-001", datasetId: "dataset-001" }]),
      createRun: vi.fn(async (input) => ({ id: "run-001", status: "queued", ...input })),
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
        setDefault: vi.fn(async (key) => ({ key, isDefault: true }))
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
      }
    });
    expect(repositories.jobsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001"
      })
    );
    expect(recognitionOrchestrator.start).toHaveBeenCalledWith({
      jobId: "job-001",
      document: {
        documentId: "file-001"
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
          deidentified: true
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
});

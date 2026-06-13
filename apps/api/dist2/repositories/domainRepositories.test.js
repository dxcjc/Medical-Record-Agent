import { describe, expect, it, vi } from "vitest";
import { createEvaluationRepository } from "./evaluation.repository";
import { createFeedbackRepository } from "./feedback.repository";
import { createFileRepository } from "./file.repository";
import { createJobsRepository } from "./jobs.repository";
import { createProviderRepository } from "./provider.repository";
import { createResultsRepository } from "./results.repository";
import { createSchemaRepository } from "./schema.repository";
import { createWritebackRepository } from "./writeback.repository";
describe("domain repositories", () => {
    it("文件仓库只返回存储元数据，不暴露本地路径，并支持软删除", async () => {
        const storedFileRow = {
            id: "file-001",
            storageKey: "records/2026/demo-file.pdf",
            originalName: "demo-file.pdf",
            mimeType: "application/pdf",
            byteSize: BigInt(1024),
            checksumSha256: "abc",
            visibility: "private",
            metadata: { source: "demo" },
            uploadedById: "user-001",
            createdAt: new Date("2026-06-04T12:00:00.000Z"),
            deletedAt: null
        };
        const storedFile = {
            create: vi.fn().mockResolvedValue(storedFileRow),
            findUnique: vi.fn().mockResolvedValue(storedFileRow),
            update: vi.fn().mockResolvedValue({
                ...storedFileRow,
                deletedAt: new Date("2026-06-04T13:00:00.000Z")
            }),
            findMany: vi.fn().mockResolvedValue([storedFileRow])
        };
        const repository = createFileRepository({ storedFile });
        const created = await repository.create({
            storageKey: storedFileRow.storageKey,
            originalName: storedFileRow.originalName,
            mimeType: storedFileRow.mimeType,
            byteSize: storedFileRow.byteSize,
            checksumSha256: storedFileRow.checksumSha256,
            metadata: storedFileRow.metadata,
            uploadedById: storedFileRow.uploadedById
        });
        expect(created.storageKey).toBe("records/2026/demo-file.pdf");
        expect(Object.keys(created)).not.toContain("localPath");
        const deletedAt = new Date("2026-06-04T13:00:00.000Z");
        await repository.softDelete("file-001", deletedAt);
        expect(storedFile.update).toHaveBeenCalledWith({
            where: { id: "file-001" },
            data: { deletedAt }
        });
    });
    it("任务与结果仓库能够更新任务状态并按 jobId upsert 结果", async () => {
        const recognitionJob = {
            create: vi.fn().mockResolvedValue({ id: "job-001" }),
            findUnique: vi.fn().mockResolvedValue({ id: "job-001", status: "running" }),
            update: vi.fn().mockResolvedValue({ id: "job-001", status: "completed" }),
            findMany: vi.fn().mockResolvedValue([])
        };
        const recognitionResult = {
            upsert: vi.fn().mockResolvedValue({ id: "result-001", jobId: "job-001" }),
            findUnique: vi.fn().mockResolvedValue({ id: "result-001", jobId: "job-001" })
        };
        const jobsRepository = createJobsRepository({ recognitionJob });
        const resultsRepository = createResultsRepository({ recognitionResult });
        await jobsRepository.updateStatus({
            id: "job-001",
            status: "completed",
            completedAt: new Date("2026-06-04T14:00:00.000Z"),
            warnings: [{ code: "LOW_CONFIDENCE" }]
        });
        expect(recognitionJob.update).toHaveBeenCalledWith({
            where: { id: "job-001" },
            data: expect.objectContaining({
                status: "completed",
                completedAt: new Date("2026-06-04T14:00:00.000Z"),
                warnings: [{ code: "LOW_CONFIDENCE" }]
            }),
            select: expect.any(Object)
        });
        await resultsRepository.upsertByJobId({
            jobId: "job-001",
            fields: [{ fieldKey: "clinicalDiagnosis", value: "DEMO_DIAGNOSIS_A" }],
            normalizedFields: { clinicalDiagnosis: "DEMO_DIAGNOSIS_A" },
            evidence: [{ fieldKey: "clinicalDiagnosis", snippet: "诊断：DEMO_DIAGNOSIS_A" }],
            payload: { clinicalInfo: { clinicalDiagnosis: "DEMO_DIAGNOSIS_A" } },
            confidence: 0.96,
            reviewRequired: false
        });
        expect(recognitionResult.upsert).toHaveBeenCalledWith({
            where: { jobId: "job-001" },
            update: expect.objectContaining({
                reviewRequired: false
            }),
            create: expect.objectContaining({
                jobId: "job-001",
                reviewRequired: false
            }),
            select: expect.any(Object)
        });
        await jobsRepository.listEligibleForWriteback(15);
        expect(recognitionJob.findMany).toHaveBeenCalledWith({
            where: {
                status: {
                    in: ["completed"]
                },
                result: {
                    is: {
                        reviewRequired: false
                    }
                },
                writebacks: {
                    none: {
                        status: {
                            in: ["pending", "running", "succeeded"]
                        }
                    }
                }
            },
            include: {
                result: true,
                writebacks: {
                    orderBy: {
                        attemptedAt: "desc"
                    }
                }
            },
            orderBy: {
                completedAt: "desc"
            },
            take: 15
        });
    });
    it("schema 仓库能够按 active 版本查询，并保存草稿校验结果", async () => {
        const schemaVersion = {
            findFirst: vi.fn().mockResolvedValue({ id: "version-001", schemaKey: "lims-clinical-info", status: "active" }),
            create: vi.fn().mockResolvedValue({ id: "version-002" }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({ id: "version-001", status: "inactive" }),
            findUnique: vi.fn().mockResolvedValue({ id: "version-001" })
        };
        const schemaDraft = {
            create: vi.fn().mockResolvedValue({ id: "draft-001" }),
            findUnique: vi.fn().mockResolvedValue({ id: "draft-001" }),
            update: vi.fn().mockResolvedValue({ id: "draft-001", status: "ready" })
        };
        const repository = createSchemaRepository({ schemaVersion, schemaDraft });
        await repository.findActiveVersionBySchemaKey("lims-clinical-info");
        expect(schemaVersion.findFirst).toHaveBeenCalledWith({
            where: {
                schemaKey: "lims-clinical-info",
                status: "active"
            },
            orderBy: {
                version: "desc"
            }
        });
        await repository.updateDraftValidation({
            id: "draft-001",
            status: "ready",
            validationReport: {
                ok: true,
                warnings: []
            }
        });
        expect(schemaDraft.update).toHaveBeenCalledWith({
            where: { id: "draft-001" },
            data: {
                status: "ready",
                validationReport: {
                    ok: true,
                    warnings: []
                }
            }
        });
        await repository.updateDraftDefinition({
            id: "draft-001",
            definition: {
                key: "lims-clinical-info"
            },
            status: "draft",
            validationReport: {}
        });
        expect(schemaDraft.update).toHaveBeenCalledWith({
            where: { id: "draft-001" },
            data: {
                definition: {
                    key: "lims-clinical-info"
                },
                status: "draft",
                validationReport: {}
            }
        });
        await repository.deactivateActiveVersions("lims-clinical-info");
        expect(schemaVersion.updateMany).toHaveBeenCalledWith({
            where: {
                schemaKey: "lims-clinical-info",
                status: "active"
            },
            data: {
                status: "inactive"
            }
        });
        await repository.setVersionStatus({
            id: "version-001",
            status: "active"
        });
        expect(schemaVersion.update).toHaveBeenCalledWith({
            where: { id: "version-001" },
            data: {
                status: "active"
            }
        });
    });
    it("反馈、写回和评估仓库能够执行后续业务需要的关键状态操作", async () => {
        const feedbackSubmission = {
            create: vi.fn().mockResolvedValue({ id: "feedback-001" }),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue({ id: "feedback-001", status: "reviewed" })
        };
        const writebackAttempt = {
            create: vi.fn().mockResolvedValue({ id: "writeback-001" }),
            update: vi.fn().mockResolvedValue({ id: "writeback-001", status: "succeeded" }),
            findUnique: vi.fn().mockResolvedValue({ id: "writeback-001", idempotencyKey: "idem-001" }),
            findMany: vi.fn().mockResolvedValue([])
        };
        const evaluationDataset = {
            create: vi.fn().mockResolvedValue({ id: "dataset-001" }),
            findMany: vi.fn().mockResolvedValue([
                {
                    id: "dataset-001",
                    displayName: "评估集",
                    _count: {
                        samples: 2,
                        runs: 1
                    }
                }
            ]),
            findUnique: vi.fn().mockResolvedValue({ id: "dataset-001", displayName: "评估集" })
        };
        const evaluationSample = {
            create: vi.fn().mockResolvedValue({ id: "sample-001" }),
            findMany: vi.fn().mockResolvedValue([{ id: "sample-001", datasetId: "dataset-001" }])
        };
        const evaluationRun = {
            create: vi.fn().mockResolvedValue({ id: "run-001" }),
            update: vi.fn().mockResolvedValue({ id: "run-001", status: "completed" }),
            findUnique: vi.fn().mockResolvedValue({ id: "run-001", createdById: "user-001" }),
            findMany: vi.fn().mockResolvedValue([])
        };
        const evaluationMetric = {
            upsert: vi.fn().mockResolvedValue({ id: "metric-001", runId: "run-001", name: "accuracy" }),
            findMany: vi.fn().mockResolvedValue([{ id: "metric-001", runId: "run-001", name: "accuracy" }])
        };
        const feedbackRepository = createFeedbackRepository({ feedbackSubmission });
        const writebackRepository = createWritebackRepository({ writebackAttempt });
        const evaluationRepository = createEvaluationRepository({
            evaluationDataset,
            evaluationSample,
            evaluationRun,
            evaluationMetric
        });
        await feedbackRepository.markReviewed("feedback-001", new Date("2026-06-04T15:00:00.000Z"));
        expect(feedbackSubmission.update).toHaveBeenCalledWith({
            where: { id: "feedback-001" },
            data: {
                status: "reviewed",
                reviewedAt: new Date("2026-06-04T15:00:00.000Z")
            }
        });
        await writebackRepository.complete("writeback-001", {
            status: "succeeded",
            responsePayload: { receiptId: "receipt-001" },
            retryable: false,
            completedAt: new Date("2026-06-04T15:10:00.000Z")
        });
        expect(writebackAttempt.update).toHaveBeenCalledWith({
            where: { id: "writeback-001" },
            data: expect.objectContaining({
                status: "succeeded",
                responsePayload: { receiptId: "receipt-001" },
                retryable: false,
                completedAt: new Date("2026-06-04T15:10:00.000Z")
            })
        });
        await evaluationRepository.listRunsByDataset("dataset-001");
        expect(evaluationRun.findMany).toHaveBeenCalledWith({
            where: { datasetId: "dataset-001" },
            orderBy: {
                createdAt: "desc"
            }
        });
        await evaluationRepository.listDatasets();
        expect(evaluationDataset.findMany).toHaveBeenCalledWith({
            include: {
                _count: {
                    select: {
                        samples: true,
                        runs: true
                    }
                }
            },
            orderBy: [
                { updatedAt: "desc" },
                { createdAt: "desc" }
            ]
        });
        await evaluationRepository.findDatasetById("dataset-001");
        expect(evaluationDataset.findUnique).toHaveBeenCalledWith({
            where: { id: "dataset-001" },
            include: {
                _count: {
                    select: {
                        samples: true,
                        runs: true
                    }
                }
            }
        });
        await evaluationRepository.listSamples("dataset-001", 25);
        expect(evaluationSample.findMany).toHaveBeenCalledWith({
            where: { datasetId: "dataset-001" },
            orderBy: {
                createdAt: "asc"
            },
            take: 25
        });
        await evaluationRepository.findRunById({
            id: "run-001",
            actorUserId: "user-001"
        });
        expect(evaluationRun.findUnique).toHaveBeenCalledWith({
            where: { id: "run-001" },
            include: {
                dataset: true,
                metrics: {
                    orderBy: {
                        name: "asc"
                    }
                }
            }
        });
        await evaluationRepository.markRunStarted("run-001", new Date("2026-06-04T15:20:00.000Z"));
        expect(evaluationRun.update).toHaveBeenCalledWith({
            where: { id: "run-001" },
            data: {
                status: "running",
                startedAt: new Date("2026-06-04T15:20:00.000Z")
            }
        });
        await evaluationRepository.upsertMetric({
            runId: "run-001",
            name: "accuracy",
            value: "0.980000",
            unit: "%",
            breakdown: {
                clinicalDiagnosis: 0.98
            }
        });
        expect(evaluationMetric.upsert).toHaveBeenCalledWith({
            where: {
                runId_name: {
                    runId: "run-001",
                    name: "accuracy"
                }
            },
            update: {
                value: "0.980000",
                unit: "%",
                breakdown: {
                    clinicalDiagnosis: 0.98
                }
            },
            create: {
                runId: "run-001",
                name: "accuracy",
                value: "0.980000",
                unit: "%",
                breakdown: {
                    clinicalDiagnosis: 0.98
                }
            }
        });
        await evaluationRepository.listMetrics("run-001");
        expect(evaluationMetric.findMany).toHaveBeenCalledWith({
            where: { runId: "run-001" },
            orderBy: {
                name: "asc"
            }
        });
        await evaluationRepository.completeRun("run-001", {
            status: "completed",
            summary: {
                sampleCount: 2
            },
            error: {
                code: "NONE"
            },
            schemaVersionId: "schema-version-002",
            completedAt: new Date("2026-06-04T15:30:00.000Z")
        });
        expect(evaluationRun.update).toHaveBeenCalledWith({
            where: { id: "run-001" },
            data: {
                status: "completed",
                summary: {
                    sampleCount: 2
                },
                completedAt: new Date("2026-06-04T15:30:00.000Z"),
                error: {
                    code: "NONE"
                },
                schemaVersion: {
                    connect: {
                        id: "schema-version-002"
                    }
                }
            }
        });
    });
    it("provider 仓库能持久化在线配置，并在设为默认时关闭同类型旧默认", async () => {
        const providerConfig = {
            upsert: vi.fn().mockResolvedValue({
                id: "provider-config-001",
                key: "openai-responses-prod",
                kind: "llm",
                displayName: "OpenAI Responses 生产模型",
                status: "active",
                isDefault: true,
                config: {
                    model: "gpt-4.1-mini",
                    timeoutMs: 45000
                },
                secretRefs: {
                    apiKey: "OPENAI_API_KEY"
                },
                updatedById: "user-001"
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn()
        };
        const repository = createProviderRepository({ providerConfig });
        const saved = await repository.save({
            key: "openai-responses-prod",
            kind: "llm",
            displayName: "OpenAI Responses 生产模型",
            status: "active",
            isDefault: true,
            config: {
                model: "gpt-4.1-mini",
                timeoutMs: 45000
            },
            secretRefs: {
                apiKey: "OPENAI_API_KEY"
            },
            updatedById: "user-001"
        });
        expect(providerConfig.updateMany).toHaveBeenCalledWith({
            where: {
                kind: "llm",
                key: {
                    not: "openai-responses-prod"
                },
                isDefault: true
            },
            data: {
                isDefault: false
            }
        });
        expect(providerConfig.upsert).toHaveBeenCalledWith({
            where: {
                key: "openai-responses-prod"
            },
            update: expect.objectContaining({
                displayName: "OpenAI Responses 生产模型",
                isDefault: true,
                updatedById: "user-001"
            }),
            create: expect.objectContaining({
                key: "openai-responses-prod",
                kind: "llm",
                status: "active",
                isDefault: true
            }),
            select: expect.any(Object)
        });
        expect(saved).toEqual(expect.objectContaining({
            key: "openai-responses-prod",
            isDefault: true
        }));
    });
});
//# sourceMappingURL=domainRepositories.test.js.map
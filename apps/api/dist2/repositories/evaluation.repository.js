/**
 * 评估仓库围绕 dataset、sample、run 三个层级提供持久化接口，
 * 便于后续离线评估、结果回放和指标查询统一落在同一处维护。
 */
export function createEvaluationRepository(dependencies) {
    return {
        async listDatasets() {
            return dependencies.evaluationDataset.findMany({
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
        },
        async findDatasetById(id) {
            return dependencies.evaluationDataset.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: {
                            samples: true,
                            runs: true
                        }
                    }
                }
            });
        },
        async createDataset(input) {
            return dependencies.evaluationDataset.create({
                data: {
                    key: input.key,
                    displayName: input.displayName,
                    description: input.description ?? null,
                    status: input.status ?? "draft",
                    deidentified: input.deidentified ?? false,
                    metadata: input.metadata ?? {}
                }
            });
        },
        async addSample(input) {
            return dependencies.evaluationSample.create({
                data: {
                    datasetId: input.datasetId,
                    fileId: input.fileId ?? null,
                    recognitionJobId: input.recognitionJobId ?? null,
                    externalId: input.externalId ?? null,
                    groundTruth: input.groundTruth,
                    metadata: input.metadata ?? {}
                }
            });
        },
        async listSamples(datasetId, limit) {
            return dependencies.evaluationSample.findMany({
                where: { datasetId },
                orderBy: {
                    createdAt: "asc"
                },
                ...(limit === undefined ? {} : { take: limit })
            });
        },
        async createRun(input) {
            return dependencies.evaluationRun.create({
                data: {
                    datasetId: input.datasetId,
                    schemaVersionId: input.schemaVersionId ?? null,
                    createdById: input.createdById ?? null,
                    providerConfig: input.providerConfig ?? {}
                }
            });
        },
        async findRunById(input) {
            const run = await dependencies.evaluationRun.findUnique({
                where: { id: input.id },
                include: {
                    dataset: true,
                    metrics: {
                        orderBy: {
                            name: "asc"
                        }
                    }
                }
            });
            // 评估运行只允许创建者读取；未传 actorUserId 时保留仓库内部调用的直接查询能力。
            if (run && input.actorUserId && run.createdById && run.createdById !== input.actorUserId) {
                return null;
            }
            return run;
        },
        async markRunStarted(id, startedAt) {
            return dependencies.evaluationRun.update({
                where: { id },
                data: {
                    status: "running",
                    startedAt
                }
            });
        },
        async completeRun(id, input) {
            const data = {
                status: input.status,
                summary: input.summary,
                completedAt: input.completedAt
            };
            if (input.error !== undefined) {
                data.error = input.error;
            }
            if (input.schemaVersionId !== undefined) {
                data.schemaVersion = input.schemaVersionId === null ? { disconnect: true } : { connect: { id: input.schemaVersionId } };
            }
            return dependencies.evaluationRun.update({
                where: { id },
                data
            });
        },
        async upsertMetric(input) {
            const data = {
                value: input.value,
                unit: input.unit ?? null,
                breakdown: input.breakdown ?? {}
            };
            return dependencies.evaluationMetric.upsert({
                where: {
                    runId_name: {
                        runId: input.runId,
                        name: input.name
                    }
                },
                update: data,
                create: {
                    runId: input.runId,
                    name: input.name,
                    ...data
                }
            });
        },
        async listMetrics(runId) {
            return dependencies.evaluationMetric.findMany({
                where: { runId },
                orderBy: {
                    name: "asc"
                }
            });
        },
        async listRunsByDataset(datasetId) {
            return dependencies.evaluationRun.findMany({
                where: { datasetId },
                orderBy: {
                    createdAt: "desc"
                }
            });
        }
    };
}
//# sourceMappingURL=evaluation.repository.js.map
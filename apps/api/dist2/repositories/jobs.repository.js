const jobSelection = {
    id: true,
    status: true,
    schemaKey: true,
    schemaVersionId: true,
    sourceFileId: true,
    createdById: true,
    providerConfig: true,
    options: true,
    trace: true,
    warnings: true,
    error: true,
    startedAt: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true
};
/**
 * 任务仓库承接识别任务生命周期的数据库操作。
 * 这里把状态更新和列表查询聚合在一起，后续工作流调度、任务路由和审计中间件都能直接复用。
 */
export function createJobsRepository(dependencies) {
    return {
        async create(input) {
            return dependencies.recognitionJob.create({
                data: {
                    status: input.status ?? "queued",
                    schemaKey: input.schemaKey,
                    schemaVersionId: input.schemaVersionId ?? null,
                    sourceFileId: input.sourceFileId ?? null,
                    createdById: input.createdById ?? null,
                    providerConfig: input.providerConfig ?? {},
                    options: input.options ?? {},
                    trace: [],
                    warnings: []
                },
                select: jobSelection
            });
        },
        async findById(id) {
            return dependencies.recognitionJob.findUnique({
                where: { id },
                select: jobSelection
            });
        },
        async listByCreator(createdById, limit = 20) {
            return dependencies.recognitionJob.findMany({
                where: { createdById },
                select: jobSelection,
                orderBy: {
                    createdAt: "desc"
                },
                take: limit
            });
        },
        async list(limit = 50) {
            return dependencies.recognitionJob.findMany({
                select: jobSelection,
                orderBy: {
                    createdAt: "desc"
                },
                take: limit
            });
        },
        async listEligibleForWriteback(limit = 20) {
            return dependencies.recognitionJob.findMany({
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
                take: limit
            });
        },
        async updateStatus(input) {
            const data = {
                status: input.status
            };
            if (input.startedAt !== undefined) {
                data.startedAt = input.startedAt;
            }
            if (input.completedAt !== undefined) {
                data.completedAt = input.completedAt;
            }
            if (input.trace !== undefined) {
                data.trace = input.trace;
            }
            if (input.warnings !== undefined) {
                data.warnings = input.warnings;
            }
            if (input.error !== undefined) {
                data.error = input.error;
            }
            return dependencies.recognitionJob.update({
                where: { id: input.id },
                data,
                select: jobSelection
            });
        }
    };
}
//# sourceMappingURL=jobs.repository.js.map
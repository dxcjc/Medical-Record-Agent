/**
 * 写回仓库把“准备写回”和“写回完成”拆成两次显式持久化，
 * 这样失败重试、审计追踪和幂等键排查都能依赖同一张表。
 */
export function createWritebackRepository(dependencies) {
    return {
        async create(input) {
            return dependencies.writebackAttempt.create({
                data: {
                    jobId: input.jobId,
                    targetSystem: input.targetSystem,
                    endpoint: input.endpoint,
                    idempotencyKey: input.idempotencyKey,
                    requestPayload: input.requestPayload
                }
            });
        },
        async findByIdempotencyKey(idempotencyKey) {
            return dependencies.writebackAttempt.findUnique({
                where: { idempotencyKey }
            });
        },
        async listByJobId(jobId) {
            return dependencies.writebackAttempt.findMany({
                where: { jobId },
                orderBy: {
                    attemptedAt: "desc"
                }
            });
        },
        async complete(id, input) {
            const data = {
                status: input.status,
                retryable: input.retryable,
                completedAt: input.completedAt
            };
            if (input.responsePayload !== undefined) {
                data.responsePayload = input.responsePayload;
            }
            if (input.error !== undefined) {
                data.error = input.error;
            }
            return dependencies.writebackAttempt.update({
                where: { id },
                data
            });
        }
    };
}
//# sourceMappingURL=writeback.repository.js.map
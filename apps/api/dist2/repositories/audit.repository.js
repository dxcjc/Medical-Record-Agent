const auditCreateSelection = {
    id: true,
    action: true,
    objectType: true,
    objectId: true,
    result: true
};
/**
 * 创建审计仓储。
 * 这里把“如何写审计”和“如何按最近记录查询”的固定规则集中起来，方便后续中间件直接复用。
 */
export function createAuditRepository(dependencies) {
    const { auditLog } = dependencies;
    return {
        /**
         * 写入审计日志。
         * 仓储只接受已经脱敏或安全化后的 metadata，不承接任何明文口令或 token。
         */
        async create(input) {
            const data = {
                action: input.action,
                objectType: input.objectType,
                result: input.result,
                metadata: input.metadata ?? {}
            };
            if (input.actorUserId !== undefined) {
                data.actorUserId = input.actorUserId;
            }
            if (input.actorApiTokenId !== undefined) {
                data.actorApiTokenId = input.actorApiTokenId;
            }
            if (input.objectId !== undefined) {
                data.objectId = input.objectId;
            }
            if (input.ipAddress !== undefined) {
                data.ipAddress = input.ipAddress;
            }
            if (input.userAgent !== undefined) {
                data.userAgent = input.userAgent;
            }
            return auditLog.create({
                data,
                select: auditCreateSelection
            });
        },
        /**
         * 查询最近审计记录。
         * 默认按创建时间倒序，便于登录审计、权限追踪等场景直接消费。
         */
        async listRecent(input) {
            const createdAt = input.createdFrom || input.createdTo ? {} : undefined;
            if (createdAt && input.createdFrom) {
                createdAt.gte = input.createdFrom;
            }
            if (createdAt && input.createdTo) {
                createdAt.lte = input.createdTo;
            }
            const where = {};
            if (input.actorUserId) {
                where.actorUserId = input.actorUserId;
            }
            if (input.actorApiTokenId) {
                where.actorApiTokenId = input.actorApiTokenId;
            }
            if (input.action) {
                where.action = input.action;
            }
            if (createdAt) {
                where.createdAt = createdAt;
            }
            return auditLog.findMany({
                where,
                orderBy: {
                    createdAt: "desc"
                },
                take: input.take ?? 50
            });
        }
    };
}
//# sourceMappingURL=audit.repository.js.map
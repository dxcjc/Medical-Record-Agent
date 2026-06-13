const webhookSelection = {
    id: true,
    callbackUrl: true,
    schemaKey: true,
    events: true,
    active: true,
    createdById: true,
    createdAt: true,
    updatedAt: true
};
/**
 * Webhook 仓库负责 webhook 订阅的数据库操作。
 * 支持按 schemaKey 过滤活跃订阅，便于识别任务完成后触发回调。
 */
export function createWebhookRepository(dependencies) {
    return {
        async create(input) {
            return dependencies.webhookSubscription.create({
                data: {
                    callbackUrl: input.callbackUrl,
                    schemaKey: input.schemaKey ?? null,
                    events: input.events ?? ["recognition.completed"],
                    createdById: input.createdById ?? null
                },
                select: webhookSelection
            });
        },
        async findById(id) {
            return dependencies.webhookSubscription.findUnique({
                where: { id },
                select: webhookSelection
            });
        },
        async listActive(schemaKey) {
            const where = {
                active: true
            };
            if (schemaKey) {
                where.OR = [
                    { schemaKey: null },
                    { schemaKey }
                ];
            }
            return dependencies.webhookSubscription.findMany({
                where,
                orderBy: { createdAt: "desc" }
            });
        },
        async list(limit = 50) {
            return dependencies.webhookSubscription.findMany({
                select: webhookSelection,
                orderBy: { createdAt: "desc" },
                take: limit
            });
        },
        async delete(id) {
            await dependencies.webhookSubscription.delete({
                where: { id }
            });
        },
        async deactivate(id) {
            return dependencies.webhookSubscription.update({
                where: { id },
                data: { active: false },
                select: webhookSelection
            });
        }
    };
}
//# sourceMappingURL=webhook.repository.js.map
import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject, assertRouteResponseObjectList, confirmedWritebackRouteInputSchema } from "./route-dtos";
function isServerConfirmedJob(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const status = value.status;
    const confirmed = value.confirmed;
    return status === "completed" || status === "confirmed" || confirmed === true;
}
/**
 * 注册自动写回路由。
 * Agent 本身不承载人工确认 UI，但写回 API 仍要求调用方传入 confirmed=true，避免低置信或未授权任务被直接回填。
 */
export async function registerWritebackRoutes(server, dependencies) {
    server.get("/writeback/eligible", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute)
        ]
    }, async (request) => {
        const query = request.query;
        const parsedLimit = typeof query.limit === "string" ? Number(query.limit) : undefined;
        const limit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
        return {
            items: assertRouteResponseObjectList(await dependencies.writebackService.listEligible({
                actor: request.auth,
                limit
            }), "WRITEBACK_ELIGIBLE_RESPONSE_INVALID")
        };
    });
    server.post("/writeback", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.writebackExecute),
            ...(dependencies.rateLimit ? [dependencies.rateLimit] : []),
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "writeback.execute",
                        objectType: "job",
                        objectId: (request) => request.body?.jobId
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const parsedBody = confirmedWritebackRouteInputSchema.safeParse(request.body);
        if (!parsedBody.success) {
            const confirmed = request.body && typeof request.body === "object" ? request.body.confirmed : undefined;
            if (confirmed !== true) {
                return reply.status(409).send({
                    error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
                });
            }
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "Invalid writeback payload"
            });
        }
        const parsedInput = {
            jobId: parsedBody.data.jobId,
            confirmed: true
        };
        if (parsedBody.data.idempotencyKey !== undefined) {
            parsedInput.idempotencyKey = parsedBody.data.idempotencyKey;
        }
        const job = await dependencies.jobService.get(parsedInput.jobId);
        if (!isServerConfirmedJob(job)) {
            return reply.status(409).send({
                error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
            });
        }
        return assertRouteResponseObject(await dependencies.writebackService.execute({
            ...parsedInput,
            actor: request.auth
        }), "WRITEBACK_RESPONSE_INVALID");
    });
}
//# sourceMappingURL=writeback.routes.js.map
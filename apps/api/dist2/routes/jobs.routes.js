import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject, recognitionJobRouteInputSchema } from "./route-dtos";
function sendNotFound() {
    return {
        error: "NOT_FOUND"
    };
}
/**
 * 注册识别任务路由。
 * 创建任务需要 job:create，查看任务需要 job:read，调用方系统可用 JWT 或 API token 进入同一鉴权链路。
 */
export async function registerJobRoutes(server, dependencies) {
    server.post("/jobs", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.jobCreate)
        ]
    }, async (request, reply) => {
        const parsed = recognitionJobRouteInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "Invalid recognition job payload"
            });
        }
        const job = await dependencies.jobService.create(parsed.data);
        return assertRouteResponseObject(job, "JOB_CREATE_RESPONSE_INVALID");
    });
    server.get("/jobs/:id", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
        ]
    }, async (request, reply) => {
        const params = request.params;
        const job = await dependencies.jobService.get(params.id);
        if (!job) {
            return reply.status(404).send(sendNotFound());
        }
        return assertRouteResponseObject(job, "JOB_RESPONSE_INVALID");
    });
    server.get("/jobs", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.jobRead)
        ]
    }, async (request, reply) => {
        const query = request.query;
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        const jobs = await dependencies.jobService.list(limit);
        return { items: jobs };
    });
}
//# sourceMappingURL=jobs.routes.js.map
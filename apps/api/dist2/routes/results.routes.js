import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject } from "./route-dtos";
function sendNotFound() {
    return {
        error: "NOT_FOUND"
    };
}
/**
 * 注册识别结果路由。
 * 结果可能包含病历结构化字段和证据片段，因此必须通过 job:read 权限保护。
 */
export async function registerResultRoutes(server, dependencies) {
    server.get("/results/:jobId", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.jobRead),
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "result.view",
                        objectType: "job",
                        objectId: (request) => request.params.jobId
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const params = request.params;
        const result = await dependencies.resultService.getByJobId(params.jobId);
        if (!result) {
            return reply.status(404).send(sendNotFound());
        }
        return assertRouteResponseObject(result, "RESULT_RESPONSE_INVALID");
    });
}
//# sourceMappingURL=results.routes.js.map
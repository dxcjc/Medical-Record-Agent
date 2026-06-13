import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject, feedbackRouteInputSchema } from "./route-dtos";
/**
 * 注册反馈采集路由。
 * 反馈既可来自人工纠偏，也可来自调用方系统的质控结果，统一写入 feedback service。
 */
export async function registerFeedbackRoutes(server, dependencies) {
    server.post("/feedback", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate),
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "feedback.create",
                        objectType: "feedback"
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const parsed = feedbackRouteInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "Invalid feedback payload"
            });
        }
        const input = { ...parsed.data };
        if (!input.fieldKey && input.field) {
            input.fieldKey = input.field;
        }
        const feedback = await dependencies.feedbackService.create(input);
        return assertRouteResponseObject(feedback, "FEEDBACK_RESPONSE_INVALID");
    });
    server.get("/feedback", {
        preHandler: [
            dependencies.authHooks.authenticate,
            dependencies.authHooks.requirePermission(PERMISSIONS.feedbackCreate)
        ]
    }, async (request, reply) => {
        const query = request.query;
        if (!query.jobId || typeof query.jobId !== "string") {
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "jobId query parameter is required"
            });
        }
        const items = await dependencies.feedbackService.listByJobId(query.jobId);
        return {
            items: items.map((item) => assertRouteResponseObject(item, "FEEDBACK_RESPONSE_INVALID"))
        };
    });
}
//# sourceMappingURL=feedback.routes.js.map
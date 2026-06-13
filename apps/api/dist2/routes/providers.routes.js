import { PERMISSIONS } from "../auth/permissions";
import { assertRouteResponseObject, assertRouteResponseObjectList, providerConfigRouteInputSchema, redactSensitiveRouteValue } from "./route-dtos";
function readErrorStatus(error) {
    return typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
}
function readErrorCode(error) {
    return typeof error.code === "string" && error.code.length > 0 ? error.code : "PROVIDER_ERROR";
}
async function sendStructuredProviderError(reply, error) {
    const structured = error && typeof error === "object" ? error : {};
    // 错误响应只返回稳定 code，不返回 Error.message，避免 secretRefs 明文被异常消息带出。
    return reply.status(readErrorStatus(structured)).send({
        error: readErrorCode(structured)
    });
}
/**
 * 注册 Provider 管理路由。
 * 路由层只解析 HTTP 参数、调用注入的 providerService，并统一做密钥响应脱敏；
 * provider 配置的持久化与默认值切换逻辑由上层注入的 service/repository 实现承接。
 */
export async function registerProviderRoutes(server, dependencies) {
    const preHandler = [
        dependencies.authHooks.authenticate,
        dependencies.authHooks.requirePermission(PERMISSIONS.providerManage)
    ];
    server.get("/providers", {
        preHandler
    }, async () => {
        const providers = await dependencies.providerService.listProviders();
        return {
            items: redactSensitiveRouteValue(assertRouteResponseObjectList(providers, "PROVIDER_LIST_RESPONSE_INVALID"))
        };
    });
    server.post("/providers/:key/default", {
        preHandler: [
            ...preHandler,
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "provider.default.set",
                        objectType: "provider",
                        objectId: (request) => request.params.key
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const params = request.params;
        try {
            const provider = await dependencies.providerService.setDefaultProvider({
                key: params.key,
                actor: request.auth
            });
            return {
                provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
            };
        }
        catch (error) {
            return sendStructuredProviderError(reply, error);
        }
    });
    server.put("/providers/:key", {
        preHandler: [
            ...preHandler,
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "provider.config.save",
                        objectType: "provider",
                        objectId: (request) => request.params.key
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const params = request.params;
        const parsed = providerConfigRouteInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: "BAD_REQUEST",
                message: "Invalid provider config payload"
            });
        }
        try {
            if (!dependencies.providerService.saveProviderConfig) {
                throw Object.assign(new Error("PROVIDER_SAVE_NOT_SUPPORTED"), {
                    code: "PROVIDER_SAVE_NOT_SUPPORTED",
                    statusCode: 501
                });
            }
            const provider = await dependencies.providerService.saveProviderConfig({
                key: params.key,
                ...parsed.data,
                actor: request.auth
            });
            return {
                provider: redactSensitiveRouteValue(assertRouteResponseObject(provider, "PROVIDER_RESPONSE_INVALID"))
            };
        }
        catch (error) {
            return sendStructuredProviderError(reply, error);
        }
    });
    server.post("/providers/:key/health", {
        preHandler: [
            ...preHandler,
            ...(dependencies.auditHooks
                ? [
                    dependencies.auditHooks.audit({
                        action: "provider.health.check",
                        objectType: "provider",
                        objectId: (request) => request.params.key
                    })
                ]
                : [])
        ]
    }, async (request, reply) => {
        const params = request.params;
        try {
            const health = await dependencies.providerService.checkProviderHealth({
                key: params.key,
                actor: request.auth
            });
            return {
                health: redactSensitiveRouteValue(assertRouteResponseObject(health, "PROVIDER_HEALTH_RESPONSE_INVALID"))
            };
        }
        catch (error) {
            return sendStructuredProviderError(reply, error);
        }
    });
}
//# sourceMappingURL=providers.routes.js.map
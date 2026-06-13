function resolveObjectId(request, descriptor) {
    if (typeof descriptor.objectId === "function") {
        return descriptor.objectId(request);
    }
    return descriptor.objectId;
}
function buildSafeMetadata(request, statusCode) {
    return {
        method: request.method,
        url: request.url,
        statusCode
    };
}
/**
 * 创建审计钩子。
 * 审计记录只写入 actor、动作、对象和结果等安全字段，不把请求体里的 password/token
 * 或 Authorization、x-api-token 这类认证头复制进 metadata，避免明文凭证落库。
 */
export function createAuditHooks(dependencies) {
    const audit = (descriptor) => {
        return async (request, reply) => {
            const writeAudit = (result) => {
                const input = {
                    action: descriptor.action,
                    objectType: descriptor.objectType,
                    result,
                    ipAddress: request.ip,
                    metadata: buildSafeMetadata(request, reply.statusCode)
                };
                const objectId = resolveObjectId(request, descriptor);
                const userAgent = request.headers["user-agent"];
                if (request.auth?.actorUserId !== undefined) {
                    input.actorUserId = request.auth.actorUserId;
                }
                if (request.auth?.actorApiTokenId !== undefined) {
                    input.actorApiTokenId = request.auth.actorApiTokenId;
                }
                if (objectId !== undefined) {
                    input.objectId = objectId;
                }
                if (userAgent !== undefined) {
                    input.userAgent = userAgent;
                }
                void dependencies.recordAudit(input);
            };
            reply.raw.once("finish", () => {
                writeAudit(reply.statusCode >= 400 ? "failure" : "success");
            });
        };
    };
    return {
        audit
    };
}
//# sourceMappingURL=audit.middleware.js.map
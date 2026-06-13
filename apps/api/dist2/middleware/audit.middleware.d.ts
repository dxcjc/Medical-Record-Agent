import type { FastifyRequest, preHandlerHookHandler } from "fastify";
export type AuditResultValue = "success" | "failure";
export interface AuditRecordInput {
    actorUserId?: string;
    actorApiTokenId?: string;
    action: string;
    objectType: string;
    objectId?: string;
    result: AuditResultValue;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}
export type AuditRecorder = (input: AuditRecordInput) => Promise<unknown>;
export interface AuditHooksDependencies {
    recordAudit: AuditRecorder;
}
export interface AuditDescriptor {
    action: string;
    objectType: string;
    objectId?: string | ((request: FastifyRequest) => string | undefined);
}
/**
 * 创建审计钩子。
 * 审计记录只写入 actor、动作、对象和结果等安全字段，不把请求体里的 password/token
 * 或 Authorization、x-api-token 这类认证头复制进 metadata，避免明文凭证落库。
 */
export declare function createAuditHooks(dependencies: AuditHooksDependencies): {
    audit: (descriptor: AuditDescriptor) => preHandlerHookHandler;
};
//# sourceMappingURL=audit.middleware.d.ts.map
import type { FastifyInstance } from "fastify";
import { type ApiRouteResponseObject } from "./route-dtos";
export interface AuditListInput {
    actorUserId?: string;
    actorApiTokenId?: string;
    action?: string;
    take?: number;
}
export interface AuditRouteService {
    listRecent(input: AuditListInput): Promise<ApiRouteResponseObject[]>;
}
export interface AuditRoutesDependencies {
    auditService: AuditRouteService;
    authHooks: ReturnType<typeof import("../middleware/auth.middleware").createAuthHooks>;
}
/**
 * 注册审计查询路由。
 * 审计列表属于敏感运维数据，必须先认证，再显式检查 audit:read 权限。
 */
export declare function registerAuditRoutes(server: FastifyInstance, dependencies: AuditRoutesDependencies): Promise<void>;
//# sourceMappingURL=audit.routes.d.ts.map
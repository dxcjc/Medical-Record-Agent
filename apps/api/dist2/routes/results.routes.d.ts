import type { FastifyInstance } from "fastify";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { type ApiRouteResponseObject } from "./route-dtos";
export interface ResultRouteService {
    getByJobId(jobId: string): Promise<ApiRouteResponseObject | null>;
}
export interface ResultRoutesDependencies {
    resultService: ResultRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
    auditHooks?: ReturnType<typeof createAuditHooks>;
}
/**
 * 注册识别结果路由。
 * 结果可能包含病历结构化字段和证据片段，因此必须通过 job:read 权限保护。
 */
export declare function registerResultRoutes(server: FastifyInstance, dependencies: ResultRoutesDependencies): Promise<void>;
//# sourceMappingURL=results.routes.d.ts.map
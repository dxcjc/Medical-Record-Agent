import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { type ApiRouteResponseObject } from "./route-dtos";
export interface WritebackRouteService {
    execute(input: ExecuteWritebackRouteInput): Promise<ApiRouteResponseObject>;
    listEligible(input: {
        actor: AuthContext;
        limit: number;
    }): Promise<ApiRouteResponseObject[]>;
}
export interface WritebackJobRouteService {
    get(id: string): Promise<unknown | null>;
}
export interface WritebackRoutesDependencies {
    writebackService: WritebackRouteService;
    jobService: WritebackJobRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
    auditHooks?: ReturnType<typeof createAuditHooks>;
    rateLimit?: preHandlerHookHandler;
}
export interface ExecuteWritebackRouteInput {
    jobId: string;
    confirmed: true;
    idempotencyKey?: string;
    actor: AuthContext;
}
/**
 * 注册自动写回路由。
 * Agent 本身不承载人工确认 UI，但写回 API 仍要求调用方传入 confirmed=true，避免低置信或未授权任务被直接回填。
 */
export declare function registerWritebackRoutes(server: FastifyInstance, dependencies: WritebackRoutesDependencies): Promise<void>;
//# sourceMappingURL=writeback.routes.d.ts.map
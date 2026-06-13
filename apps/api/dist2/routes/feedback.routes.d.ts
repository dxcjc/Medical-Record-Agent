import type { FastifyInstance } from "fastify";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { type ApiRouteResponseObject, type CreateFeedbackRouteInput } from "./route-dtos";
export interface FeedbackRouteService {
    create(input: CreateFeedbackRouteInput): Promise<ApiRouteResponseObject>;
    listByJobId(jobId: string): Promise<ApiRouteResponseObject[]>;
}
export interface FeedbackRoutesDependencies {
    feedbackService: FeedbackRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
    auditHooks?: ReturnType<typeof createAuditHooks>;
}
/**
 * 注册反馈采集路由。
 * 反馈既可来自人工纠偏，也可来自调用方系统的质控结果，统一写入 feedback service。
 */
export declare function registerFeedbackRoutes(server: FastifyInstance, dependencies: FeedbackRoutesDependencies): Promise<void>;
//# sourceMappingURL=feedback.routes.d.ts.map
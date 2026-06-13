import type { AuthLayerService } from "./middleware/auth.middleware";
import type { AuditRecorder } from "./middleware/audit.middleware";
import { type AuditRouteService } from "./routes/audit.routes";
import { type AuthRouteService } from "./routes/auth.routes";
import { type EvaluationRouteService } from "./routes/evaluation.routes";
import { type FeedbackRouteService } from "./routes/feedback.routes";
import { type FileRouteService } from "./routes/files.routes";
import { type JobRouteService } from "./routes/jobs.routes";
import { type ProviderRouteService } from "./routes/providers.routes";
import { type ResultRouteService } from "./routes/results.routes";
import { type SchemaRouteService } from "./routes/schemas.routes";
import { type WritebackRouteService } from "./routes/writeback.routes";
import { type KnowledgeRouteService } from "./routes/knowledge.routes";
export interface ApiServerServices {
    authService: AuthLayerService & AuthRouteService;
    auditService: AuditRouteService & {
        record: AuditRecorder;
    };
    schemaService: SchemaRouteService;
    fileService: FileRouteService;
    jobService: JobRouteService;
    resultService: ResultRouteService;
    feedbackService: FeedbackRouteService;
    writebackService: WritebackRouteService;
    providerService: ProviderRouteService;
    evaluationService: EvaluationRouteService;
    knowledgeService?: KnowledgeRouteService;
    jobQueue?: {
        drain(): Promise<void>;
        describe?(): unknown;
    };
}
export interface ApiRuntimeInfo {
    serviceMode: string;
    providers: {
        ocr: string;
        llm: string;
        storage: string;
        writeback: string;
    };
    secretResolver?: unknown;
    sessionInvalidationStore?: unknown;
    queue?: unknown;
}
export interface CreateApiServerOptions {
    services: ApiServerServices;
    logger?: boolean;
    runtimeInfo?: ApiRuntimeInfo;
    rateLimit?: ApiRateLimitOptions;
}
export interface ApiRateLimitRule {
    max: number;
    windowMs: number;
}
export interface ApiRateLimitOptions {
    login?: ApiRateLimitRule;
    writeback?: ApiRateLimitRule;
}
/**
 * 创建完整 API server。依赖注入，便于测试和生产启动。
 */
export declare function createApiServer(options: CreateApiServerOptions): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
//# sourceMappingURL=server.d.ts.map
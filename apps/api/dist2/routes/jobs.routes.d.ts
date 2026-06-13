import type { FastifyInstance } from "fastify";
import type { createAuthHooks } from "../middleware/auth.middleware";
import { type ApiRouteResponseObject, type CreateRecognitionJobRouteInput } from "./route-dtos";
export interface RecognitionJobDocumentServiceInput {
    documentId: string;
    fileName?: string | undefined;
    mimeType?: string | undefined;
    storageKey?: string | undefined;
    content?: Uint8Array;
}
export type CreateRecognitionJobServiceInput = Omit<CreateRecognitionJobRouteInput, "document"> & {
    document?: RecognitionJobDocumentServiceInput | undefined;
};
export interface JobRouteService {
    create(input: CreateRecognitionJobServiceInput): Promise<ApiRouteResponseObject>;
    get(id: string): Promise<ApiRouteResponseObject | null>;
    list(limit?: number): Promise<ApiRouteResponseObject[]>;
}
export interface JobRoutesDependencies {
    jobService: JobRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
}
/**
 * 注册识别任务路由。
 * 创建任务需要 job:create，查看任务需要 job:read，调用方系统可用 JWT 或 API token 进入同一鉴权链路。
 */
export declare function registerJobRoutes(server: FastifyInstance, dependencies: JobRoutesDependencies): Promise<void>;
//# sourceMappingURL=jobs.routes.d.ts.map
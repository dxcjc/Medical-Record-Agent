import type { FastifyInstance } from "fastify";
import type { createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { type ApiRouteResponseObject, type CreateFileUploadRouteInput } from "./route-dtos";
export interface FileRouteService {
    createUpload(input: CreateFileUploadRouteInput): Promise<ApiRouteResponseObject>;
    getContent(id: string): Promise<{
        id: string;
        originalName: string;
        mimeType: string;
        body: Buffer;
    } | null>;
}
export interface FileRoutesDependencies {
    fileService: FileRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
    auditHooks?: ReturnType<typeof createAuditHooks>;
}
/**
 * 注册文件上传元数据路由。
 * 这里用 job:create 权限保护入口，因为上传病历文件是创建识别任务的前置动作。
 */
export declare function registerFileRoutes(server: FastifyInstance, dependencies: FileRoutesDependencies): Promise<void>;
//# sourceMappingURL=files.routes.d.ts.map
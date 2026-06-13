import type { FastifyInstance } from "fastify";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import { type ApiRouteResponseObject, type CreateSchemaDraftRouteInput, type UpdateSchemaDraftRouteInput } from "./route-dtos";
export interface SchemaRouteService {
    listActive(): Promise<ApiRouteResponseObject[]>;
    createDraft(input: CreateSchemaDraftRouteInput & {
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    updateDraft(input: UpdateSchemaDraftRouteInput & {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    validateDraft(input: UpdateSchemaDraftRouteInput & {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    publishDraft(input: {
        id: string;
        changelog: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    deactivateVersion(input: {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    rollbackVersion(input: {
        id: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
    compareVersions(input: {
        schemaKey: string;
        leftVersionId: string;
        rightVersionId: string;
        actor: AuthContext;
    }): Promise<ApiRouteResponseObject>;
}
export interface SchemaRoutesDependencies {
    schemaService: SchemaRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
}
/**
 * 注册字段 schema 查询路由。
 * 第一版只暴露已发布/激活的 schema 列表，草稿、发布和回滚会在 Schema Studio 后续任务中扩展。
 */
export declare function registerSchemaRoutes(server: FastifyInstance, dependencies: SchemaRoutesDependencies): Promise<void>;
//# sourceMappingURL=schemas.routes.d.ts.map
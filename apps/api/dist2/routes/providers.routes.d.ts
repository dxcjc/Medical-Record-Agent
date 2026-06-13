import type { FastifyInstance } from "fastify";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import type { createAuditHooks } from "../middleware/audit.middleware";
import { type ApiRouteResponseObject, type ProviderConfigRouteInput } from "./route-dtos";
export interface SetDefaultProviderInput {
    key: string;
    actor: AuthContext;
}
export interface SaveProviderConfigInput {
    key: string;
    kind: ProviderConfigRouteInput["kind"];
    displayName: ProviderConfigRouteInput["displayName"];
    enabled: ProviderConfigRouteInput["enabled"];
    isDefault: ProviderConfigRouteInput["isDefault"];
    config: ProviderConfigRouteInput["config"];
    secretRefs?: ProviderConfigRouteInput["secretRefs"];
    actor: AuthContext;
}
export interface ProviderRouteService {
    listProviders(): Promise<ApiRouteResponseObject[]>;
    saveProviderConfig?(input: SaveProviderConfigInput): Promise<ApiRouteResponseObject>;
    setDefaultProvider(input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
    checkProviderHealth(input: SetDefaultProviderInput): Promise<ApiRouteResponseObject>;
}
export interface ProviderRoutesDependencies {
    providerService: ProviderRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
    auditHooks?: ReturnType<typeof createAuditHooks>;
}
/**
 * 注册 Provider 管理路由。
 * 路由层只解析 HTTP 参数、调用注入的 providerService，并统一做密钥响应脱敏；
 * provider 配置的持久化与默认值切换逻辑由上层注入的 service/repository 实现承接。
 */
export declare function registerProviderRoutes(server: FastifyInstance, dependencies: ProviderRoutesDependencies): Promise<void>;
//# sourceMappingURL=providers.routes.d.ts.map
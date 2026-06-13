import type { preHandlerHookHandler } from "fastify";
export interface AuthContext {
    actorUserId: string;
    actorApiTokenId?: string;
    authType: "jwt" | "api-token";
    permissions: string[];
    roles: string[];
}
export interface AuthLayerService {
    authenticateJwt(token: string): Promise<AuthContext>;
    authenticateApiToken(token: string): Promise<AuthContext>;
    isSessionTokenInvalidated?(token: string): boolean | Promise<boolean>;
    describeSessionInvalidationStore?(): unknown;
    requirePermission(context: AuthContext | null, permission: string): void;
}
export interface AuthHooksDependencies {
    authService: AuthLayerService;
}
declare module "fastify" {
    interface FastifyRequest {
        auth?: AuthContext;
    }
}
/**
 * 创建 Fastify 认证钩子。
 * 这里不直接实例化 auth service，而是只依赖 verifyJwt、verifyApiToken、requirePermission
 * 这类入口能力，方便后续主代理把真实服务实现接进来。
 */
export declare function createAuthHooks(dependencies: AuthHooksDependencies): {
    authenticate: preHandlerHookHandler<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").RouteGenericInterface, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, import("fastify").FastifyBaseLogger>;
    requirePermission: (permission: string) => preHandlerHookHandler;
};
//# sourceMappingURL=auth.middleware.d.ts.map
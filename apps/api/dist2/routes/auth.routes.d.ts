import type { FastifyInstance, preHandlerHookHandler } from "fastify";
export interface LoginInput {
    email: string;
    password: string;
}
export interface AuthRouteService {
    login(input: LoginInput): Promise<unknown>;
    invalidateSessionToken?(token: string): Promise<void>;
}
export interface AuthRoutesDependencies {
    authService: AuthRouteService;
    rateLimit?: preHandlerHookHandler;
}
/**
 * 注册认证路由。
 * 路由层只负责解析 HTTP 入参和返回认证服务产出的 token payload，
 * 密码校验、JWT 签发等核心逻辑继续留在 auth service 中。
 */
export declare function registerAuthRoutes(server: FastifyInstance, dependencies: AuthRoutesDependencies): Promise<void>;
//# sourceMappingURL=auth.routes.d.ts.map
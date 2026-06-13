import type { FastifyInstance } from "fastify";
/**
 * 安全响应头中间件。
 * 在每个响应上注入 CSP、X-Frame-Options、X-Content-Type-Options 等安全头，
 * 防止点击劫持、MIME 嗅探和 XSS 攻击。
 */
export declare function registerSecurityHeaders(server: FastifyInstance): Promise<void>;
//# sourceMappingURL=security.middleware.d.ts.map
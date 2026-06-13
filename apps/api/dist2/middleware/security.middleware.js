/**
 * 安全响应头中间件。
 * 在每个响应上注入 CSP、X-Frame-Options、X-Content-Type-Options 等安全头，
 * 防止点击劫持、MIME 嗅探和 XSS 攻击。
 */
export async function registerSecurityHeaders(server) {
    server.addHook("onRequest", async (_request, reply) => {
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("X-Frame-Options", "DENY");
        reply.header("X-XSS-Protection", "1; mode=block");
        reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
        reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:");
        if (process.env.NODE_ENV === "production") {
            reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }
    });
}
//# sourceMappingURL=security.middleware.js.map
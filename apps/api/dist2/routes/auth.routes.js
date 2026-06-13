import { readSessionCookie, serializeClearedSessionCookie, serializeSessionCookie } from "../auth/session-cookie";
function isLoginInput(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const input = value;
    return typeof input.email === "string" && typeof input.password === "string";
}
function readAccessToken(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return null;
    }
    const accessToken = payload.accessToken;
    return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
}
/**
 * 注册认证路由。
 * 路由层只负责解析 HTTP 入参和返回认证服务产出的 token payload，
 * 密码校验、JWT 签发等核心逻辑继续留在 auth service 中。
 */
export async function registerAuthRoutes(server, dependencies) {
    server.post("/auth/login", {
        preHandler: dependencies.rateLimit ? [dependencies.rateLimit] : []
    }, async (request, reply) => {
        if (!isLoginInput(request.body)) {
            return reply.status(400).send({
                error: "BAD_REQUEST"
            });
        }
        const payload = await dependencies.authService.login({
            email: request.body.email,
            password: request.body.password
        });
        const oldSessionToken = readSessionCookie(request.headers.cookie);
        if (oldSessionToken) {
            await dependencies.authService.invalidateSessionToken?.(oldSessionToken);
        }
        const accessToken = readAccessToken(payload);
        if (accessToken) {
            reply.header("set-cookie", serializeSessionCookie(accessToken));
        }
        return reply.send(payload);
    });
    server.post("/auth/logout", async (request, reply) => {
        const sessionToken = readSessionCookie(request.headers.cookie);
        if (sessionToken) {
            await dependencies.authService.invalidateSessionToken?.(sessionToken);
        }
        reply.header("set-cookie", serializeClearedSessionCookie());
        return reply.send({ ok: true });
    });
}
//# sourceMappingURL=auth.routes.js.map
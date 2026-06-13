import { readSessionCookie } from "../auth/session-cookie";
function getAuthErrorCode(error) {
    if (error && typeof error === "object" && "code" in error) {
        const code = error.code;
        if (code === "FORBIDDEN") {
            return "FORBIDDEN";
        }
    }
    return "UNAUTHORIZED";
}
async function sendAuthError(reply, code) {
    const statusCode = code === "FORBIDDEN" ? 403 : 401;
    await reply.status(statusCode).send({
        error: code
    });
}
function readBearerToken(request) {
    const authorization = request.headers.authorization;
    if (!authorization) {
        return null;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}
function readApiToken(request) {
    const headerToken = request.headers["x-api-token"];
    if (typeof headerToken === "string" && headerToken.length > 0) {
        return headerToken;
    }
    const authorization = request.headers.authorization;
    if (!authorization) {
        return null;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "apitoken" || !token) {
        return null;
    }
    return token;
}
/**
 * 创建 Fastify 认证钩子。
 * 这里不直接实例化 auth service，而是只依赖 verifyJwt、verifyApiToken、requirePermission
 * 这类入口能力，方便后续主代理把真实服务实现接进来。
 */
export function createAuthHooks(dependencies) {
    const authenticate = async (request, reply) => {
        const bearerToken = readBearerToken(request);
        const sessionToken = readSessionCookie(request.headers.cookie);
        const apiToken = readApiToken(request);
        if (!bearerToken && !sessionToken && !apiToken) {
            await sendAuthError(reply, "UNAUTHORIZED");
            return;
        }
        try {
            const jwtToken = bearerToken ?? sessionToken;
            if (jwtToken) {
                if (sessionToken === jwtToken && (await dependencies.authService.isSessionTokenInvalidated?.(jwtToken))) {
                    throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
                }
                request.auth = await dependencies.authService.authenticateJwt(jwtToken);
                return;
            }
            request.auth = await dependencies.authService.authenticateApiToken(apiToken);
        }
        catch (error) {
            await sendAuthError(reply, getAuthErrorCode(error));
        }
    };
    const requirePermission = (permission) => {
        return async (request, reply) => {
            try {
                dependencies.authService.requirePermission(request.auth ?? null, permission);
            }
            catch (error) {
                await sendAuthError(reply, getAuthErrorCode(error));
            }
        };
    };
    return {
        authenticate,
        requirePermission
    };
}
//# sourceMappingURL=auth.middleware.js.map
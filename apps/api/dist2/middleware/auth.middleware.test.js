import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuthHooks } from "./auth.middleware";
function createServer(authService, permission = "schema:publish") {
    const server = Fastify();
    const authHooks = createAuthHooks({ authService });
    server.get("/protected", {
        preHandler: [authHooks.authenticate, authHooks.requirePermission(permission)]
    }, async (request) => {
        return {
            ok: true,
            actor: request.auth?.actorUserId
        };
    });
    return server;
}
describe("auth middleware", () => {
    it("无认证访问受保护接口时返回 401", async () => {
        const authService = {
            authenticateJwt: vi.fn(),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const server = createServer(authService);
        const response = await server.inject({
            method: "GET",
            url: "/protected"
        });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
            error: "UNAUTHORIZED"
        });
        expect(authService.authenticateJwt).not.toHaveBeenCalled();
        expect(authService.authenticateApiToken).not.toHaveBeenCalled();
    });
    it("已认证但缺权限时返回 403", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["job:read"],
            roles: ["reviewer"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn(() => {
                throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
            })
        };
        const server = createServer(authService);
        const response = await server.inject({
            method: "GET",
            url: "/protected",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(403);
        expect(authService.authenticateJwt).toHaveBeenCalledWith("valid-jwt");
        expect(authService.requirePermission).toHaveBeenCalledWith(context, "schema:publish");
    });
    it("有权限时允许访问并把认证上下文挂到 request.auth", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "api-token",
            actorApiTokenId: "token-001",
            permissions: ["schema:publish"],
            roles: ["operator"]
        };
        const authService = {
            authenticateJwt: vi.fn(),
            authenticateApiToken: vi.fn(async () => context),
            requirePermission: vi.fn()
        };
        const server = createServer(authService);
        const response = await server.inject({
            method: "GET",
            url: "/protected",
            headers: {
                "x-api-token": "plain-api-token"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            ok: true,
            actor: "user-001"
        });
        expect(authService.authenticateApiToken).toHaveBeenCalledWith("plain-api-token");
    });
});
//# sourceMappingURL=auth.middleware.test.js.map
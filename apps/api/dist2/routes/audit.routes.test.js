import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuthHooks } from "../middleware/auth.middleware";
import { registerAuditRoutes } from "./audit.routes";
function createServer(authService, auditService) {
    const server = Fastify();
    const authHooks = createAuthHooks({ authService });
    return registerAuditRoutes(server, {
        auditService,
        authHooks
    }).then(() => server);
}
describe("audit routes", () => {
    it("audit list route 无认证时返回 401", async () => {
        const authService = {
            authenticateJwt: vi.fn(),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn()
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit"
        });
        expect(response.statusCode).toBe(401);
        expect(auditService.listRecent).not.toHaveBeenCalled();
    });
    it("audit list route 已认证但缺少 audit:read 权限时返回 403", async () => {
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
        const auditService = {
            listRecent: vi.fn()
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(403);
        expect(authService.requirePermission).toHaveBeenCalledWith(context, "audit:read");
        expect(auditService.listRecent).not.toHaveBeenCalled();
    });
    it("audit list route 有 audit:read 权限时返回审计列表", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["audit:read"],
            roles: ["admin"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn(async () => [
                {
                    id: "audit-001",
                    action: "auth.login",
                    objectType: "auth",
                    objectId: "login",
                    result: "success",
                    createdAt: "2026-06-04T12:00:00.000Z"
                }
            ])
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit?take=20&action=auth.login",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(authService.requirePermission).toHaveBeenCalledWith(context, "audit:read");
        expect(auditService.listRecent).toHaveBeenCalledWith({
            take: 20,
            action: "auth.login"
        });
        expect(response.json()).toEqual({
            items: [
                {
                    id: "audit-001",
                    action: "auth.login",
                    objectType: "auth",
                    objectId: "login",
                    result: "success",
                    createdAt: "2026-06-04T12:00:00.000Z"
                }
            ]
        });
    });
    it("audit list route 响应前脱敏历史 metadata 中的 token、password 和认证头", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["audit:read"],
            roles: ["admin"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn(async () => [
                {
                    id: "audit-002",
                    action: "provider.health.check",
                    objectType: "provider",
                    objectId: "http-ocr",
                    actorApiTokenId: "api-token-id-safe",
                    result: "success",
                    metadata: {
                        method: "POST",
                        url: "/providers/http-ocr/health",
                        headers: {
                            Authorization: "Bearer real-audit-token",
                            "x-api-token": "real-x-api-token"
                        },
                        password: "real-password",
                        apiKey: "real-api-key",
                        nested: {
                            clientSecret: "real-client-secret",
                            note: "provider ready with Bearer real-message-token"
                        }
                    },
                    createdAt: "2026-06-04T12:00:00.000Z"
                }
            ])
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            items: [
                {
                    id: "audit-002",
                    action: "provider.health.check",
                    objectType: "provider",
                    objectId: "http-ocr",
                    actorApiTokenId: "api-token-id-safe",
                    result: "success",
                    metadata: {
                        method: "POST",
                        url: "/providers/http-ocr/health",
                        headers: {
                            Authorization: {
                                redacted: true
                            },
                            "x-api-token": {
                                redacted: true
                            }
                        },
                        password: {
                            redacted: true
                        },
                        apiKey: {
                            redacted: true
                        },
                        nested: {
                            clientSecret: {
                                redacted: true
                            },
                            note: "provider ready with [redacted]"
                        }
                    },
                    createdAt: "2026-06-04T12:00:00.000Z"
                }
            ]
        });
        expect(response.body).toContain("api-token-id-safe");
        expect(response.body).not.toContain("real-audit-token");
        expect(response.body).not.toContain("real-x-api-token");
        expect(response.body).not.toContain("real-password");
        expect(response.body).not.toContain("real-api-key");
        expect(response.body).not.toContain("real-client-secret");
        expect(response.body).not.toContain("real-message-token");
    });
    it("audit list route 收敛查询 DTO，忽略未知 query 字段", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["audit:read"],
            roles: ["admin"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn(async () => [])
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit?take=50&action=provider.config.save&actorUserId=user-001&createdById=client-spoof",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(auditService.listRecent).toHaveBeenCalledWith({
            take: 50,
            action: "provider.config.save",
            actorUserId: "user-001"
        });
    });
    it("audit list route 拒绝非法 take，避免分页契约静默漂移", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["audit:read"],
            roles: ["admin"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn(async () => [])
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit?take=12abc&action=provider.config.save",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: "BAD_REQUEST",
            message: "Invalid audit query"
        });
        expect(auditService.listRecent).not.toHaveBeenCalled();
    });
    it("audit list route 限制 take 上限并拒绝 service 返回 scalar 列表项", async () => {
        const context = {
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["audit:read"],
            roles: ["admin"]
        };
        const authService = {
            authenticateJwt: vi.fn(async () => context),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const auditService = {
            listRecent: vi.fn(async () => ["not-object"])
        };
        const server = await createServer(authService, auditService);
        const response = await server.inject({
            method: "GET",
            url: "/audit?take=1000",
            headers: {
                authorization: "Bearer valid-jwt"
            }
        });
        expect(response.statusCode).toBe(500);
        expect(auditService.listRecent).toHaveBeenCalledWith({
            take: 100
        });
    });
});
//# sourceMappingURL=audit.routes.test.js.map
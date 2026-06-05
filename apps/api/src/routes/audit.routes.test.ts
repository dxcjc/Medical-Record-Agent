import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createAuthHooks, type AuthContext, type AuthLayerService } from "../middleware/auth.middleware";
import { registerAuditRoutes, type AuditRouteService } from "./audit.routes";

function createServer(authService: AuthLayerService, auditService: AuditRouteService) {
  const server = Fastify();
  const authHooks = createAuthHooks({ authService });
  return registerAuditRoutes(server, {
    auditService,
    authHooks
  }).then(() => server);
}

describe("audit routes", () => {
  it("audit list route 无认证时返回 401", async () => {
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const auditService: AuditRouteService = {
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
    const context: AuthContext = {
      actorUserId: "user-001",
      authType: "jwt",
      permissions: ["job:read"],
      roles: ["reviewer"]
    };
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn(() => {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      })
    };
    const auditService: AuditRouteService = {
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
    const context: AuthContext = {
      actorUserId: "user-001",
      authType: "jwt",
      permissions: ["audit:read"],
      roles: ["admin"]
    };
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const auditService: AuditRouteService = {
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
});

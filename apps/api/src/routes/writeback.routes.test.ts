import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createAuthHooks, type AuthContext, type AuthLayerService } from "../middleware/auth.middleware";
import { registerWritebackRoutes, type WritebackRouteService } from "./writeback.routes";

function createAuthContext(permissions: string[]): AuthContext {
  return {
    actorUserId: "user-001",
    authType: "jwt",
    permissions,
    roles: ["operator"]
  };
}

function createAuthService(context: AuthContext): AuthLayerService {
  return {
    authenticateJwt: vi.fn(async () => context),
    authenticateApiToken: vi.fn(async () => context),
    requirePermission: vi.fn((authContext, permission) => {
      if (!authContext) {
        throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
      }

      if (!authContext.permissions.includes(permission)) {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      }
    })
  };
}

async function createServer(input: { authService: AuthLayerService; writebackService: WritebackRouteService }) {
  const server = Fastify();
  const authHooks = createAuthHooks({ authService: input.authService });

  await registerWritebackRoutes(server, {
    writebackService: input.writebackService,
    jobService: {
      get: vi.fn(async () => ({ id: "job-001", status: "completed" }))
    },
    authHooks
  });

  return server;
}

describe("writeback routes", () => {
  it("GET /writeback/eligible 未认证时返回 401 且不查询候选列表", async () => {
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const writebackService: WritebackRouteService = {
      execute: vi.fn(),
      listEligible: vi.fn(async () => [])
    };
    const server = await createServer({ authService, writebackService });

    const response = await server.inject({
      method: "GET",
      url: "/writeback/eligible?limit=20"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(writebackService.listEligible).not.toHaveBeenCalled();
  });

  it("GET /writeback/eligible 已认证但缺少 writeback:execute 权限时返回 403", async () => {
    const context = createAuthContext(["job:read"]);
    const authService = createAuthService(context);
    const writebackService: WritebackRouteService = {
      execute: vi.fn(),
      listEligible: vi.fn(async () => [])
    };
    const server = await createServer({ authService, writebackService });

    const response = await server.inject({
      method: "GET",
      url: "/writeback/eligible?limit=20",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(403);
    expect(authService.requirePermission).toHaveBeenCalledWith(context, "writeback:execute");
    expect(writebackService.listEligible).not.toHaveBeenCalled();
  });

  it("GET /writeback/eligible 有权限时透传 actor 和 limit，并返回 items 包装", async () => {
    const context = createAuthContext(["writeback:execute"]);
    const authService = createAuthService(context);
    const writebackService: WritebackRouteService = {
      execute: vi.fn(),
      listEligible: vi.fn(async () => [
        {
          id: "job-eligible-001",
          jobId: "job-eligible-001",
          readyFields: [{ fieldKey: "clinicalDiagnosis", value: "肺腺癌" }]
        }
      ])
    };
    const server = await createServer({ authService, writebackService });

    const response = await server.inject({
      method: "GET",
      url: "/writeback/eligible?limit=5",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(200);
    expect(writebackService.listEligible).toHaveBeenCalledWith({
      actor: context,
      limit: 5
    });
    expect(response.json()).toEqual({
      items: [
        {
          id: "job-eligible-001",
          jobId: "job-eligible-001",
          readyFields: [{ fieldKey: "clinicalDiagnosis", value: "肺腺癌" }]
        }
      ]
    });
  });
});

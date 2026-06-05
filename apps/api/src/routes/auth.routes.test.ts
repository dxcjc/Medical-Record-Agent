import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerAuthRoutes, type AuthRouteService } from "./auth.routes";

describe("auth routes", () => {
  it("login route 入参缺失时返回结构化 400 且不调用认证服务", async () => {
    const authService: AuthRouteService = {
      login: vi.fn()
    };
    const server = Fastify();
    await registerAuthRoutes(server, { authService });

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@example.local"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BAD_REQUEST"
    });
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("login route 调用认证服务并返回 token payload", async () => {
    const authService: AuthRouteService = {
      login: vi.fn(async () => ({
        accessToken: "signed.jwt",
        tokenType: "Bearer",
        user: {
          id: "user-001",
          email: "demo@example.local",
          displayName: "演示用户"
        },
        permissions: ["job:read"],
        roles: ["reviewer"]
      }))
    };
    const server = Fastify();
    await registerAuthRoutes(server, { authService });

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(authService.login).toHaveBeenCalledWith({
      email: "demo@example.local",
      password: "ChangeMe123!"
    });
    expect(response.json()).toEqual({
      accessToken: "signed.jwt",
      tokenType: "Bearer",
      user: {
        id: "user-001",
        email: "demo@example.local",
        displayName: "演示用户"
      },
      permissions: ["job:read"],
      roles: ["reviewer"]
    });
  });
});

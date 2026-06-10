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

  it("login route 设置 HttpOnly session cookie，logout route 清除 cookie 并失效当前 session", async () => {
    const invalidatedTokens: string[] = [];
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
      })),
      invalidateSessionToken: vi.fn(async (token: string) => {
        invalidatedTokens.push(token);
      })
    };
    const server = Fastify();
    await registerAuthRoutes(server, { authService });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });

    expect(login.statusCode).toBe(200);
    const loginCookies = login.headers["set-cookie"];
    expect(String(loginCookies)).toContain("mra_session=signed.jwt");
    expect(String(loginCookies)).toContain("HttpOnly");
    expect(String(loginCookies)).toContain("SameSite=Lax");
    expect(String(loginCookies)).toContain("Path=/");

    const logout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: "mra_session=signed.jwt"
      }
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });
    expect(authService.invalidateSessionToken).toHaveBeenCalledWith("signed.jwt");
    expect(invalidatedTokens).toEqual(["signed.jwt"]);
    expect(String(logout.headers["set-cookie"])).toContain("mra_session=");
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
    expect(String(logout.headers["set-cookie"])).toContain("HttpOnly");
  });

  it("login route 带旧 session cookie 时会轮换会话并失效旧 token", async () => {
    const authService: AuthRouteService = {
      login: vi.fn(async () => ({
        accessToken: "new-session.jwt",
        tokenType: "Bearer",
        user: {
          id: "user-001",
          email: "demo@example.local",
          displayName: "演示用户"
        },
        permissions: ["job:read"],
        roles: ["reviewer"]
      })),
      invalidateSessionToken: vi.fn(async () => undefined)
    };
    const server = Fastify();
    await registerAuthRoutes(server, { authService });

    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: {
        cookie: "mra_session=old-session.jwt"
      },
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(authService.invalidateSessionToken).toHaveBeenCalledWith("old-session.jwt");
    expect(String(response.headers["set-cookie"])).toContain("mra_session=new-session.jwt");
  });
});

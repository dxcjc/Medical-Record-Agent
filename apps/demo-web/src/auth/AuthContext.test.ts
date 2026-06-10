import { describe, expect, it } from "vitest";

import { createStoredAuthFromLoginResponse, shouldPersistAccessToken } from "./AuthContext";
import type { LoginResponse } from "../api/client";

const loginResponse: LoginResponse = {
  accessToken: "signed.jwt.token",
  tokenType: "Bearer",
  user: {
    id: "user-001",
    email: "demo@example.local",
    displayName: "演示用户",
    status: "active"
  },
  permissions: ["job:read", "job:create"],
  roles: ["operator"]
};

describe("AuthContext session storage boundary", () => {
  it("生产环境默认启用 HttpOnly cookie session，不把 JWT 持久化到 localStorage", () => {
    const env = {
      DEV: false,
      MODE: "production"
    };

    expect(shouldPersistAccessToken(env)).toBe(false);
    expect(createStoredAuthFromLoginResponse(loginResponse, env)).toEqual({
      user: loginResponse.user,
      permissions: loginResponse.permissions,
      roles: loginResponse.roles
    });
  });

  it("开发环境和显式 legacy token 模式才允许持久化 Bearer token", () => {
    expect(shouldPersistAccessToken({ DEV: true, MODE: "development" })).toBe(true);
    expect(
      shouldPersistAccessToken({
        DEV: false,
        MODE: "production",
        VITE_AUTH_TOKEN_STORAGE: "localStorage"
      })
    ).toBe(true);
    expect(createStoredAuthFromLoginResponse(loginResponse, { DEV: true, MODE: "development" })).toEqual({
      token: "signed.jwt.token",
      user: loginResponse.user,
      permissions: loginResponse.permissions,
      roles: loginResponse.roles
    });
  });
});

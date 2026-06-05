import { ApiTokenStatus, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthService,
  flattenPermissions,
  hashApiToken,
  hashPassword,
  verifyPassword,
  type JwtSigner
} from "./auth.service";

const jwtSigner: JwtSigner = {
  sign: vi.fn(async (payload: unknown) => `signed:${JSON.stringify(payload)}`),
  verify: vi.fn(async (token: string) => {
    if (token !== "valid-token") {
      throw new Error("bad token");
    }

    return {
      sub: "user-001",
      permissions: ["job:read"],
      roles: ["reviewer"],
      authType: "jwt" as const
    };
  })
};

describe("auth service", () => {
  it("使用 bcrypt 哈希并校验密码，不保留明文", async () => {
    const hash = await hashPassword("ChangeMe123!");

    expect(hash).not.toBe("ChangeMe123!");
    await expect(verifyPassword("ChangeMe123!", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword", hash)).resolves.toBe(false);
  });

  it("能把角色里的 permissions JSON 展平成去重权限列表", () => {
    const permissions = flattenPermissions([
      {
        id: "role-admin",
        name: "admin",
        permissions: ["job:read", "writeback:execute", "job:read"]
      },
      {
        id: "role-extra",
        name: "extra",
        permissions: {
          permissions: ["schema:publish"],
          ignored: true
        }
      }
    ]);

    expect(permissions).toEqual(["job:read", "writeback:execute", "schema:publish"]);
  });

  it("登录成功时校验密码、拒绝停用用户，并签发 JWT", async () => {
    const passwordHash = await hashPassword("ChangeMe123!");
    const userRepository = {
      findAuthByEmail: vi.fn(async () => ({
        id: "user-001",
        email: "demo@example.local",
        displayName: "演示用户",
        passwordHash,
        status: UserStatus.active,
        roles: [
          {
            id: "role-reviewer",
            name: "reviewer",
            permissions: ["job:read"]
          }
        ]
      }))
    };

    const authService = createAuthService({
      userRepository,
      tokenRepository: {} as never,
      jwtSigner
    });

    const result = await authService.login({
      email: "demo@example.local",
      password: "ChangeMe123!"
    });

    expect(userRepository.findAuthByEmail).toHaveBeenCalledWith("demo@example.local");
    expect(result.accessToken).toContain("signed:");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.permissions).toEqual(["job:read"]);
  });

  it("API token 认证只按 token hash 查询有效 token，并更新 lastUsedAt", async () => {
    const now = new Date("2026-06-04T21:00:00.000Z");
    const tokenHash = hashApiToken("plain-token");
    const tokenRepository = {
      findActiveByTokenHash: vi.fn(async () => ({
        id: "token-001",
        name: "LIMS",
        tokenHash,
        status: ApiTokenStatus.active,
        scopes: ["writeback:execute"],
        expiresAt: null,
        lastUsedAt: null,
        owner: {
          id: "user-001",
          email: "service@example.local",
          displayName: "服务账号",
          status: UserStatus.active,
          roles: [
            {
              id: "role-service",
              name: "service",
              permissions: ["job:read"]
            }
          ]
        }
      })),
      touchLastUsedAt: vi.fn(async () => ({ id: "token-001", lastUsedAt: now }))
    };

    const authService = createAuthService({
      userRepository: {} as never,
      tokenRepository,
      jwtSigner,
      now: () => now
    });

    const context = await authService.authenticateApiToken("plain-token");

    expect(tokenRepository.findActiveByTokenHash).toHaveBeenCalledWith(tokenHash, now);
    expect(tokenRepository.touchLastUsedAt).toHaveBeenCalledWith("token-001", now);
    expect(context.permissions).toEqual(["job:read", "writeback:execute"]);
  });

  it("权限守卫能区分缺失认证与缺失权限", () => {
    const authService = createAuthService({
      userRepository: {} as never,
      tokenRepository: {} as never,
      jwtSigner
    });

    expect(() => authService.requirePermission(null, "schema:publish")).toThrow("UNAUTHORIZED");
    expect(() =>
      authService.requirePermission(
        {
          actorUserId: "user-001",
          authType: "jwt",
          permissions: ["job:read"],
          roles: ["reviewer"]
        },
        "schema:publish"
      )
    ).toThrow("FORBIDDEN");
  });
});

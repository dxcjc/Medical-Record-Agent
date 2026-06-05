import { ApiTokenStatus, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createTokenRepository } from "./token.repository";

describe("token.repository", () => {
  it("按 tokenHash 查询有效 token 时应过滤撤销与过期数据，并带出 owner 角色权限", async () => {
    const now = new Date("2026-06-04T20:30:00.000Z");
    const apiToken = {
      findFirst: vi.fn().mockResolvedValue({
        id: "token-001",
        name: "integration",
        tokenHash: "hashed-token",
        status: ApiTokenStatus.active,
        scopes: ["files.read"],
        expiresAt: new Date("2026-06-05T20:30:00.000Z"),
        lastUsedAt: null,
        owner: {
          id: "user-001",
          email: "owner@example.com",
          displayName: "Owner",
          status: UserStatus.active,
          roles: [
            {
              id: "role-service",
              name: "service",
              permissions: ["api.tokens.use"]
            }
          ]
        }
      })
    };

    const repository = createTokenRepository({ apiToken } as never);
    const result = await repository.findActiveByTokenHash("hashed-token", now);

    expect(apiToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: "hashed-token",
        status: ApiTokenStatus.active,
        revokedAt: null,
        OR: [
          {
            expiresAt: null
          },
          {
            expiresAt: {
              gt: now
            }
          }
        ]
      },
      select: {
        id: true,
        name: true,
        tokenHash: true,
        status: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true,
            status: true,
            roles: {
              select: {
                id: true,
                name: true,
                permissions: true
              }
            }
          }
        }
      }
    });
    expect(result?.tokenHash).toBe("hashed-token");
  });

  it("更新 token 最后使用时间时应按 id 精确更新", async () => {
    const lastUsedAt = new Date("2026-06-04T20:35:00.000Z");
    const apiToken = {
      update: vi.fn().mockResolvedValue({
        id: "token-002",
        lastUsedAt
      })
    };

    const repository = createTokenRepository({ apiToken } as never);
    await repository.touchLastUsedAt("token-002", lastUsedAt);

    expect(apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-002" },
      data: { lastUsedAt },
      select: {
        id: true,
        lastUsedAt: true
      }
    });
  });

  it("撤销 token 时应写入 revoked 状态与时间，后续查询不再命中", async () => {
    const revokedAt = new Date("2026-06-04T20:40:00.000Z");
    const apiToken = {
      update: vi.fn().mockResolvedValue({
        id: "token-003",
        status: ApiTokenStatus.revoked,
        revokedAt
      })
    };

    const repository = createTokenRepository({ apiToken } as never);
    await repository.revoke("token-003", revokedAt);

    expect(apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-003" },
      data: {
        status: ApiTokenStatus.revoked,
        revokedAt
      },
      select: {
        id: true,
        status: true,
        revokedAt: true
      }
    });
  });
});

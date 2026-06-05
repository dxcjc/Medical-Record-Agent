import type { PrismaClient } from "@prisma/client";
import { ApiTokenStatus, UserStatus } from "@prisma/client";

type TokenOwnerRole = {
  id: string;
  name: string;
  permissions: unknown;
};

/**
 * API token 归属用户的访问上下文。
 * 后续 API token 认证成功后，可直接把 owner 与角色权限挂到请求上下文。
 */
export type TokenOwnerContext = {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  roles: TokenOwnerRole[];
};

/**
 * 认证阶段使用的 token 安全视图。
 * 只处理 tokenHash，不触碰 token 明文。
 */
export type ActiveApiToken = {
  id: string;
  name: string;
  tokenHash: string;
  status: ApiTokenStatus;
  scopes: unknown;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  owner: TokenOwnerContext;
};

type TokenRepositoryDependencies = Pick<PrismaClient, "apiToken">;

/**
 * 创建 token 仓储。
 * 仓储负责封装有效 token 的筛选条件，避免调用方散落重复的安全判断。
 */
export function createTokenRepository(dependencies: TokenRepositoryDependencies) {
  const { apiToken } = dependencies;

  return {
    /**
     * 按 tokenHash 查找当前仍可使用的 token。
     * 只有 active、未撤销、且未过期的 token 才会被返回。
     */
    async findActiveByTokenHash(tokenHash: string, now: Date) {
      return apiToken.findFirst({
        where: {
          tokenHash,
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
      }) as Promise<ActiveApiToken | null>;
    },

    /**
     * 记录 token 最近一次使用时间，便于后续安全分析和活跃度判断。
     */
    async touchLastUsedAt(id: string, lastUsedAt: Date) {
      return apiToken.update({
        where: { id },
        data: { lastUsedAt },
        select: {
          id: true,
          lastUsedAt: true
        }
      });
    },

    /**
     * 撤销 token 后立即写入状态与撤销时间。
     * 后续 findActiveByTokenHash 将自动把它过滤掉。
     */
    async revoke(id: string, revokedAt: Date) {
      return apiToken.update({
        where: { id },
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
    }
  };
}

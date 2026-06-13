import { ApiTokenStatus } from "@prisma/client";
/**
 * 创建 token 仓储。
 * 仓储负责封装有效 token 的筛选条件，避免调用方散落重复的安全判断。
 */
export function createTokenRepository(dependencies) {
    const { apiToken } = dependencies;
    return {
        /**
         * 按 tokenHash 查找当前仍可使用的 token。
         * 只有 active、未撤销、且未过期的 token 才会被返回。
         */
        async findActiveByTokenHash(tokenHash, now) {
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
            });
        },
        /**
         * 记录 token 最近一次使用时间，便于后续安全分析和活跃度判断。
         */
        async touchLastUsedAt(id, lastUsedAt) {
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
        async revoke(id, revokedAt) {
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
//# sourceMappingURL=token.repository.js.map
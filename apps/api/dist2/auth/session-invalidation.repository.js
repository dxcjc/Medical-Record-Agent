const REQUIRED_CHECKS = [
    "two-instance-session-invalidation-smoke",
    "token-hash-ttl-verification",
    "raw-token-not-persisted-check",
    "login-rotation-cross-instance-smoke"
];
function createDescription(provider, storage) {
    return {
        provider,
        storage,
        productionReady: false,
        blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
        redaction: {
            rawTokenPersisted: false,
            tokenHashOnly: true
        },
        capabilities: {
            centralized: true,
            durable: true,
            ttl: true
        },
        readiness: {
            nextAction: provider === "database"
                ? "运行至少两个 API 实例共享 database session invalidation store 的登出/轮换失效 smoke。"
                : "运行至少两个 API 实例共享 Redis session invalidation store 的登出/轮换失效 smoke。",
            requiredChecks: REQUIRED_CHECKS
        }
    };
}
function positiveTtlMs(input) {
    return Math.max(1, input.expiresAt.getTime() - input.invalidatedAt.getTime());
}
export function createDatabaseSessionInvalidationRepository(options) {
    const storage = options.storageName ?? "session_invalidations";
    return {
        async upsertInvalidatedSession(input) {
            await options.delegate.upsert({
                where: { tokenHash: input.tokenHash },
                create: {
                    tokenHash: input.tokenHash,
                    invalidatedAt: input.invalidatedAt,
                    expiresAt: input.expiresAt
                },
                update: {
                    invalidatedAt: input.invalidatedAt,
                    expiresAt: input.expiresAt
                }
            });
        },
        async findInvalidatedSession(input) {
            return options.delegate.findFirst({
                where: {
                    tokenHash: input.tokenHash,
                    expiresAt: {
                        gt: input.now
                    }
                }
            });
        },
        describe() {
            return createDescription("database", storage);
        }
    };
}
export function createRedisSessionInvalidationRepository(options) {
    const keyPrefix = options.keyPrefix ?? "mra:session-invalidated:";
    function key(tokenHash) {
        return `${keyPrefix}${tokenHash}`;
    }
    return {
        async upsertInvalidatedSession(input) {
            await options.client.set(key(input.tokenHash), input.tokenHash, {
                px: positiveTtlMs(input)
            });
        },
        async findInvalidatedSession(input) {
            const value = await options.client.get(key(input.tokenHash));
            return value === input.tokenHash ? { tokenHash: input.tokenHash } : null;
        },
        describe() {
            return createDescription("redis", `redis:${keyPrefix}`);
        }
    };
}
//# sourceMappingURL=session-invalidation.repository.js.map
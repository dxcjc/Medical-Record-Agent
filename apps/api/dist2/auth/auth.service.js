import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { UserStatus } from "@prisma/client";
const PASSWORD_SALT_ROUNDS = 10;
const DEFAULT_SESSION_INVALIDATION_TTL_MS = 24 * 60 * 60 * 1000;
export class AuthError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "AuthError";
        this.code = code;
    }
}
export async function hashPassword(password) {
    return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}
export async function verifyPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}
/**
 * API token 只保存和查询不可逆 hash；明文 token 只在请求入口短暂出现。
 */
export function hashApiToken(token) {
    return createHash("sha256").update(token, "utf8").digest("hex");
}
export function hashSessionToken(token) {
    return createHash("sha256").update(token, "utf8").digest("hex");
}
function readSessionInvalidationTtlMs(value) {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_INVALIDATION_TTL_MS;
}
function createSessionInvalidationStoreReadiness(adapter) {
    if (adapter === "repository") {
        return {
            nextAction: "运行至少两个 API 实例的登出/轮换失效 smoke，确认共享 store 只保存 token hash 和 TTL。",
            requiredChecks: [
                "two-instance-session-invalidation-smoke",
                "token-hash-ttl-verification",
                "raw-token-not-persisted-check",
                "login-rotation-cross-instance-smoke"
            ]
        };
    }
    return {
        nextAction: "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
        requiredChecks: [
            "two-instance-session-invalidation-smoke",
            "token-hash-ttl-verification",
            "raw-token-not-persisted-check",
            "login-rotation-cross-instance-smoke"
        ]
    };
}
export function createInMemorySessionInvalidationStore(options = {}) {
    const invalidationTtlMs = readSessionInvalidationTtlMs(options.invalidationTtlMs);
    const now = options.now ?? (() => new Date());
    const invalidatedTokenHashes = new Map();
    function pruneExpired(current) {
        for (const [tokenHash, expiresAt] of invalidatedTokenHashes) {
            if (expiresAt <= current) {
                invalidatedTokenHashes.delete(tokenHash);
            }
        }
    }
    return {
        async invalidate(token) {
            if (token.length === 0) {
                return;
            }
            const current = now();
            pruneExpired(current);
            invalidatedTokenHashes.set(hashSessionToken(token), new Date(current.getTime() + invalidationTtlMs));
        },
        async isInvalidated(token) {
            const current = now();
            pruneExpired(current);
            const expiresAt = invalidatedTokenHashes.get(hashSessionToken(token));
            return expiresAt !== undefined && expiresAt > current;
        },
        describe() {
            return {
                adapter: "in-memory",
                productionReady: false,
                blockedReason: "SESSION_INVALIDATION_STORE_IN_MEMORY",
                capabilities: {
                    centralized: false,
                    durable: false,
                    multiInstance: false,
                    tokenHashing: true,
                    ttl: true
                },
                readiness: createSessionInvalidationStoreReadiness("in-memory"),
                policy: {
                    invalidationTtlMs
                },
            };
        }
    };
}
export function createRepositorySessionInvalidationStore(options) {
    const invalidationTtlMs = readSessionInvalidationTtlMs(options.invalidationTtlMs);
    const now = options.now ?? (() => new Date());
    return {
        async invalidate(token) {
            if (token.length === 0) {
                return;
            }
            const invalidatedAt = now();
            await options.repository.upsertInvalidatedSession({
                tokenHash: hashSessionToken(token),
                invalidatedAt,
                expiresAt: new Date(invalidatedAt.getTime() + invalidationTtlMs)
            });
        },
        async isInvalidated(token) {
            const row = await options.repository.findInvalidatedSession({
                tokenHash: hashSessionToken(token),
                now: now()
            });
            return row !== null;
        },
        describe() {
            return {
                adapter: "repository",
                provider: options.provider,
                productionReady: false,
                blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
                capabilities: {
                    centralized: true,
                    durable: true,
                    multiInstance: true,
                    tokenHashing: true,
                    ttl: true
                },
                readiness: createSessionInvalidationStoreReadiness("repository"),
                policy: {
                    invalidationTtlMs
                },
            };
        }
    };
}
function normalizePermissionValues(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === "string" && item.length > 0);
    }
    if (value && typeof value === "object" && "permissions" in value) {
        return normalizePermissionValues(value.permissions);
    }
    return [];
}
/**
 * Prisma 中 permissions 是 JSON 字段，这里统一转成去重后的字符串权限列表。
 */
export function flattenPermissions(roles) {
    const permissions = new Set();
    for (const role of roles) {
        for (const permission of normalizePermissionValues(role.permissions)) {
            permissions.add(permission);
        }
    }
    return Array.from(permissions);
}
function roleNames(roles) {
    return roles.map((role) => role.name);
}
function toAuthenticatedUser(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status
    };
}
function assertActiveUser(status) {
    if (status !== UserStatus.active) {
        throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
    }
}
export function createAuthService(dependencies) {
    const now = dependencies.now ?? (() => new Date());
    const sessionInvalidationStore = dependencies.sessionInvalidationStore ?? createInMemorySessionInvalidationStore({ now });
    return {
        async login(input) {
            const user = await dependencies.userRepository.findAuthByEmail(input.email);
            if (!user) {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
            assertActiveUser(user.status);
            const passwordOk = await verifyPassword(input.password, user.passwordHash);
            if (!passwordOk) {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
            const permissions = flattenPermissions(user.roles);
            const roles = roleNames(user.roles);
            const accessToken = await dependencies.jwtSigner.sign({
                sub: user.id,
                permissions,
                roles,
                authType: "jwt"
            });
            return {
                accessToken,
                tokenType: "Bearer",
                user: toAuthenticatedUser(user),
                permissions,
                roles
            };
        },
        async authenticateJwt(token) {
            if (await sessionInvalidationStore.isInvalidated(token)) {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
            try {
                const payload = await dependencies.jwtSigner.verify(token);
                const context = {
                    actorUserId: payload.sub,
                    authType: payload.authType,
                    permissions: payload.permissions,
                    roles: payload.roles
                };
                if (payload.apiTokenId !== undefined) {
                    context.actorApiTokenId = payload.apiTokenId;
                }
                return context;
            }
            catch {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
        },
        async invalidateSessionToken(token) {
            await sessionInvalidationStore.invalidate(token);
        },
        isSessionTokenInvalidated(token) {
            return sessionInvalidationStore.isInvalidated(token);
        },
        describeSessionInvalidationStore() {
            return sessionInvalidationStore.describe();
        },
        async authenticateApiToken(token) {
            const checkedAt = now();
            const tokenHash = hashApiToken(token);
            const apiToken = await dependencies.tokenRepository.findActiveByTokenHash(tokenHash, checkedAt);
            if (!apiToken || apiToken.owner.status !== UserStatus.active) {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
            await dependencies.tokenRepository.touchLastUsedAt(apiToken.id, checkedAt);
            return {
                actorUserId: apiToken.owner.id,
                actorApiTokenId: apiToken.id,
                authType: "api-token",
                permissions: [...flattenPermissions(apiToken.owner.roles), ...normalizePermissionValues(apiToken.scopes)],
                roles: roleNames(apiToken.owner.roles)
            };
        },
        requirePermission(context, permission) {
            if (!context) {
                throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
            }
            if (!context.permissions.includes(permission)) {
                throw new AuthError("FORBIDDEN", "FORBIDDEN");
            }
        }
    };
}
//# sourceMappingURL=auth.service.js.map
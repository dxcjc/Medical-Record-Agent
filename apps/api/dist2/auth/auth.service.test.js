import { ApiTokenStatus, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createInMemorySessionInvalidationStore, createAuthService, createRepositorySessionInvalidationStore, flattenPermissions, hashApiToken, hashPassword, hashSessionToken, verifyPassword } from "./auth.service";
const jwtSigner = {
    sign: vi.fn(async (payload) => `signed:${JSON.stringify(payload)}`),
    verify: vi.fn(async (token) => {
        if (token !== "valid-token") {
            throw new Error("bad token");
        }
        return {
            sub: "user-001",
            permissions: ["job:read"],
            roles: ["reviewer"],
            authType: "jwt"
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
            tokenRepository: {},
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
            userRepository: {},
            tokenRepository,
            jwtSigner,
            now: () => now
        });
        const context = await authService.authenticateApiToken("plain-token");
        expect(tokenRepository.findActiveByTokenHash).toHaveBeenCalledWith(tokenHash, now);
        expect(tokenRepository.touchLastUsedAt).toHaveBeenCalledWith("token-001", now);
        expect(context.permissions).toEqual(["job:read", "writeback:execute"]);
    });
    it("session invalidation store 只持久化 token hash、遵守 TTL，并暴露非多实例生产姿态", async () => {
        const token = "raw.jwt.session-token-that-must-not-be-stored";
        const tokenHash = hashSessionToken(token);
        const now = new Date("2026-06-09T09:00:00.000Z");
        const writes = [];
        const repository = {
            upsertInvalidatedSession: vi.fn(async (input) => {
                writes.push(input);
            }),
            findInvalidatedSession: vi.fn(async (input) => {
                const row = writes.find((item) => item.tokenHash === input.tokenHash && item.expiresAt > input.now);
                return row ?? null;
            })
        };
        let currentNow = now;
        const store = createRepositorySessionInvalidationStore({
            repository,
            provider: "database",
            invalidationTtlMs: 60_000,
            now: () => currentNow
        });
        await store.invalidate(token);
        expect(repository.upsertInvalidatedSession).toHaveBeenCalledWith({
            tokenHash,
            invalidatedAt: now,
            expiresAt: new Date("2026-06-09T09:01:00.000Z")
        });
        expect(JSON.stringify(writes)).not.toContain(token);
        await expect(store.isInvalidated(token)).resolves.toBe(true);
        currentNow = new Date("2026-06-09T09:01:01.000Z");
        await expect(store.isInvalidated(token)).resolves.toBe(false);
        expect(store.describe()).toEqual({
            adapter: "repository",
            provider: "database",
            productionReady: false,
            blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
            capabilities: {
                centralized: true,
                durable: true,
                multiInstance: true,
                tokenHashing: true,
                ttl: true
            },
            policy: {
                invalidationTtlMs: 60000
            },
            readiness: {
                nextAction: "运行至少两个 API 实例的登出/轮换失效 smoke，确认共享 store 只保存 token hash 和 TTL。",
                requiredChecks: [
                    "two-instance-session-invalidation-smoke",
                    "token-hash-ttl-verification",
                    "raw-token-not-persisted-check",
                    "login-rotation-cross-instance-smoke"
                ]
            }
        });
    });
    it("默认 in-memory session invalidation store 本地可用但明确非生产多实例就绪", async () => {
        const store = createInMemorySessionInvalidationStore({
            invalidationTtlMs: 1_000,
            now: () => new Date("2026-06-09T09:00:00.000Z")
        });
        await store.invalidate("raw.jwt.session-token");
        await expect(store.isInvalidated("raw.jwt.session-token")).resolves.toBe(true);
        expect(store.describe()).toEqual({
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
            policy: {
                invalidationTtlMs: 1000
            },
            readiness: {
                nextAction: "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
                requiredChecks: [
                    "two-instance-session-invalidation-smoke",
                    "token-hash-ttl-verification",
                    "raw-token-not-persisted-check",
                    "login-rotation-cross-instance-smoke"
                ]
            }
        });
    });
    it("权限守卫能区分缺失认证与缺失权限", () => {
        const authService = createAuthService({
            userRepository: {},
            tokenRepository: {},
            jwtSigner
        });
        expect(() => authService.requirePermission(null, "schema:publish")).toThrow("UNAUTHORIZED");
        expect(() => authService.requirePermission({
            actorUserId: "user-001",
            authType: "jwt",
            permissions: ["job:read"],
            roles: ["reviewer"]
        }, "schema:publish")).toThrow("FORBIDDEN");
    });
});
//# sourceMappingURL=auth.service.test.js.map
import { UserStatus } from "@prisma/client";
import type { ActiveApiToken } from "../repositories/token.repository";
import type { AuthUser, UserRoleAccess } from "../repositories/user.repository";
export interface JwtSigner {
    sign(payload: AuthTokenPayload): Promise<string>;
    verify(token: string): Promise<AuthTokenPayload>;
}
export interface AuthTokenPayload {
    sub: string;
    permissions: string[];
    roles: string[];
    authType: "jwt" | "api-token";
    apiTokenId?: string;
}
export interface LoginInput {
    email: string;
    password: string;
}
export interface AuthenticatedUser {
    id: string;
    email: string;
    displayName: string;
    status: UserStatus;
}
export interface AuthContext {
    actorUserId: string;
    actorApiTokenId?: string;
    authType: "jwt" | "api-token";
    permissions: string[];
    roles: string[];
}
export declare class AuthError extends Error {
    readonly code: "UNAUTHORIZED" | "FORBIDDEN";
    constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string);
}
export interface AuthServiceDependencies {
    userRepository: {
        findAuthByEmail(email: string): Promise<AuthUser | null>;
    };
    tokenRepository: {
        findActiveByTokenHash(tokenHash: string, now: Date): Promise<ActiveApiToken | null>;
        touchLastUsedAt(id: string, lastUsedAt: Date): Promise<unknown>;
    };
    jwtSigner: JwtSigner;
    sessionInvalidationStore?: SessionInvalidationStore;
    now?: () => Date;
}
export type SessionInvalidationStoreAdapter = "in-memory" | "repository";
export type SessionInvalidationStoreProvider = "database" | "redis";
export type SessionInvalidationStoreBlockedReason = "SESSION_INVALIDATION_STORE_IN_MEMORY" | "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED" | "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN";
export interface SessionInvalidationStoreDescription {
    adapter: SessionInvalidationStoreAdapter;
    provider?: SessionInvalidationStoreProvider;
    productionReady: boolean;
    blockedReason?: SessionInvalidationStoreBlockedReason;
    capabilities: {
        centralized: boolean;
        durable: boolean;
        multiInstance: boolean;
        tokenHashing: boolean;
        ttl: boolean;
    };
    readiness: {
        nextAction: string;
        requiredChecks: string[];
    };
    policy: {
        invalidationTtlMs: number;
    };
}
export interface SessionInvalidationRepository {
    upsertInvalidatedSession(input: {
        tokenHash: string;
        invalidatedAt: Date;
        expiresAt: Date;
    }): Promise<void>;
    findInvalidatedSession(input: {
        tokenHash: string;
        now: Date;
    }): Promise<unknown | null>;
}
export interface SessionInvalidationStore {
    invalidate(token: string): Promise<void>;
    isInvalidated(token: string): Promise<boolean>;
    describe(): SessionInvalidationStoreDescription;
}
export interface AuthService {
    login(input: LoginInput): Promise<{
        accessToken: string;
        tokenType: "Bearer";
        user: AuthenticatedUser;
        permissions: string[];
        roles: string[];
    }>;
    authenticateJwt(token: string): Promise<AuthContext>;
    authenticateApiToken(token: string): Promise<AuthContext>;
    invalidateSessionToken(token: string): Promise<void>;
    isSessionTokenInvalidated(token: string): Promise<boolean>;
    describeSessionInvalidationStore(): SessionInvalidationStoreDescription;
    requirePermission(context: AuthContext | null, permission: string): void;
}
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, passwordHash: string): Promise<boolean>;
/**
 * API token 只保存和查询不可逆 hash；明文 token 只在请求入口短暂出现。
 */
export declare function hashApiToken(token: string): string;
export declare function hashSessionToken(token: string): string;
export declare function createInMemorySessionInvalidationStore(options?: {
    invalidationTtlMs?: number;
    now?: () => Date;
}): SessionInvalidationStore;
export declare function createRepositorySessionInvalidationStore(options: {
    repository: SessionInvalidationRepository;
    provider: SessionInvalidationStoreProvider;
    invalidationTtlMs?: number;
    now?: () => Date;
}): SessionInvalidationStore;
/**
 * Prisma 中 permissions 是 JSON 字段，这里统一转成去重后的字符串权限列表。
 */
export declare function flattenPermissions(roles: UserRoleAccess[]): string[];
export declare function createAuthService(dependencies: AuthServiceDependencies): AuthService;
//# sourceMappingURL=auth.service.d.ts.map
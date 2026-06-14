import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

import { UserStatus } from "@prisma/client";

import type { ActiveApiToken } from "../repositories/token.repository";
import type { AuthUser, UserRoleAccess } from "../repositories/user.repository";

const PASSWORD_SALT_ROUNDS = 10;
const DEFAULT_SESSION_INVALIDATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface JwtSigner {
  sign(payload: AuthTokenPayload): Promise<string>;
  verify(token: string): Promise<AuthTokenPayload>;
  /** 验证签名和 payload 结构，忽略过期时间；签名无效返回 null */
  verifySignature?(token: string): Promise<AuthTokenPayload | null>;
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

export class AuthError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN";

  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
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
export type SessionInvalidationStoreBlockedReason =
  | "SESSION_INVALIDATION_STORE_IN_MEMORY"
  | "SESSION_INVALIDATION_STORE_ADAPTER_NOT_CONNECTED"
  | "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN";

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
  upsertInvalidatedSession(input: { tokenHash: string; invalidatedAt: Date; expiresAt: Date }): Promise<void>;
  findInvalidatedSession(input: { tokenHash: string; now: Date }): Promise<unknown | null>;
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
  /** 验证 token 签名（忽略过期），返回 payload；签名无效返回 null */
  verifySessionToken(token: string): Promise<{ sub: string; permissions: string[]; roles: string[] } | null>;
  /** 签发新 JWT token */
  signSessionToken(payload: { sub: string; permissions: string[]; roles: string[] }): Promise<string>;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

/**
 * API token 只保存和查询不可逆 hash；明文 token 只在请求入口短暂出现。
 */
export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function readSessionInvalidationTtlMs(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_INVALIDATION_TTL_MS;
}

function createSessionInvalidationStoreReadiness(adapter: SessionInvalidationStoreAdapter) {
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
    nextAction:
      "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
    requiredChecks: [
      "two-instance-session-invalidation-smoke",
      "token-hash-ttl-verification",
      "raw-token-not-persisted-check",
      "login-rotation-cross-instance-smoke"
    ]
  };
}

export function createInMemorySessionInvalidationStore(
  options: {
    invalidationTtlMs?: number;
    now?: () => Date;
  } = {}
): SessionInvalidationStore {
  const invalidationTtlMs = readSessionInvalidationTtlMs(options.invalidationTtlMs);
  const now = options.now ?? (() => new Date());
  const invalidatedTokenHashes = new Map<string, Date>();

  function pruneExpired(current: Date) {
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

export function createRepositorySessionInvalidationStore(options: {
  repository: SessionInvalidationRepository;
  provider: SessionInvalidationStoreProvider;
  invalidationTtlMs?: number;
  now?: () => Date;
}): SessionInvalidationStore {
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

function normalizePermissionValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  if (value && typeof value === "object" && "permissions" in value) {
    return normalizePermissionValues((value as { permissions?: unknown }).permissions);
  }

  return [];
}

/**
 * Prisma 中 permissions 是 JSON 字段，这里统一转成去重后的字符串权限列表。
 */
export function flattenPermissions(roles: UserRoleAccess[]) {
  const permissions = new Set<string>();

  for (const role of roles) {
    for (const permission of normalizePermissionValues(role.permissions)) {
      permissions.add(permission);
    }
  }

  return Array.from(permissions);
}

function roleNames(roles: UserRoleAccess[]) {
  return roles.map((role) => role.name);
}

function toAuthenticatedUser(user: AuthUser): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status
  };
}

function assertActiveUser(status: UserStatus) {
  if (status !== UserStatus.active) {
    throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
  }
}

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const now = dependencies.now ?? (() => new Date());
  const sessionInvalidationStore =
    dependencies.sessionInvalidationStore ?? createInMemorySessionInvalidationStore({ now });

  return {
    async login(input: LoginInput) {
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

    async authenticateJwt(token: string): Promise<AuthContext> {
      if (await sessionInvalidationStore.isInvalidated(token)) {
        throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
      }

      try {
        const payload = await dependencies.jwtSigner.verify(token);
        const context: AuthContext = {
          actorUserId: payload.sub,
          authType: payload.authType,
          permissions: payload.permissions,
          roles: payload.roles
        };

        if (payload.apiTokenId !== undefined) {
          context.actorApiTokenId = payload.apiTokenId;
        }

        return context;
      } catch {
        throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
      }
    },

    async invalidateSessionToken(token: string) {
      await sessionInvalidationStore.invalidate(token);
    },

    isSessionTokenInvalidated(token: string) {
      return sessionInvalidationStore.isInvalidated(token);
    },

    describeSessionInvalidationStore() {
      return sessionInvalidationStore.describe();
    },

    async authenticateApiToken(token: string): Promise<AuthContext> {
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

    requirePermission(context: AuthContext | null, permission: string) {
      if (!context) {
        throw new AuthError("UNAUTHORIZED", "UNAUTHORIZED");
      }

      if (!context.permissions.includes(permission)) {
        throw new AuthError("FORBIDDEN", "FORBIDDEN");
      }
    },

    async verifySessionToken(token: string) {
      if (!dependencies.jwtSigner.verifySignature) {
        return null;
      }

      const payload = await dependencies.jwtSigner.verifySignature(token);
      if (!payload) {
        return null;
      }

      return {
        sub: payload.sub,
        permissions: payload.permissions,
        roles: payload.roles
      };
    },

    async signSessionToken(payload) {
      return dependencies.jwtSigner.sign({
        sub: payload.sub,
        permissions: payload.permissions,
        roles: payload.roles,
        authType: "jwt"
      });
    }
  };
}

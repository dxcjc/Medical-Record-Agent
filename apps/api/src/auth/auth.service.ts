import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

import { UserStatus } from "@prisma/client";

import type { ActiveApiToken } from "../repositories/token.repository";
import type { AuthUser, UserRoleAccess } from "../repositories/user.repository";

const PASSWORD_SALT_ROUNDS = 10;

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
  now?: () => Date;
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

export function createAuthService(dependencies: AuthServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());

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
    }
  };
}

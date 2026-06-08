import crypto from "node:crypto";

import type { AuthTokenPayload, JwtSigner } from "./auth.service";

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseExpiresIn(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return 60 * 60;
  }

  const amount = Number.parseInt(match[1] ?? "1", 10);
  const unit = match[2];
  if (unit === "s") {
    return amount;
  }
  if (unit === "m") {
    return amount * 60;
  }
  if (unit === "h") {
    return amount * 60 * 60;
  }

  return amount * 24 * 60 * 60;
}

function signSegment(value: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload & { exp?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<AuthTokenPayload>;
  return (
    typeof record.sub === "string" &&
    Array.isArray(record.permissions) &&
    record.permissions.every((permission) => typeof permission === "string") &&
    Array.isArray(record.roles) &&
    record.roles.every((role) => typeof role === "string") &&
    (record.authType === "jwt" || record.authType === "api-token")
  );
}

export interface SimpleJwtSignerOptions {
  secret: string;
  expiresIn: string;
  now?: () => Date;
}

/**
 * 生产 bootstrap 使用的轻量 HS256 signer。
 * 它只实现本项目 auth service 需要的最小 JWT 能力，避免 createApiServer 之前必须先拿到 Fastify 实例。
 */
export function createSimpleJwtSigner(options: SimpleJwtSignerOptions): JwtSigner {
  const now = options.now ?? (() => new Date());

  return {
    async sign(payload) {
      const header = {
        alg: "HS256",
        typ: "JWT"
      };
      const issuedAt = Math.floor(now().getTime() / 1000);
      const body = {
        ...payload,
        iat: issuedAt,
        exp: issuedAt + parseExpiresIn(options.expiresIn)
      };
      const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;
      const signature = signSegment(unsigned, options.secret);

      return `${unsigned}.${signature}`;
    },

    async verify(token) {
      const [header, body, signature] = token.split(".");
      if (!header || !body || !signature) {
        throw new Error("JWT_INVALID");
      }

      const unsigned = `${header}.${body}`;
      const expectedSignature = signSegment(unsigned, options.secret);
      if (!timingSafeEqual(signature, expectedSignature)) {
        throw new Error("JWT_INVALID");
      }

      const payload = JSON.parse(base64UrlDecode(body)) as unknown;
      if (!isAuthTokenPayload(payload)) {
        throw new Error("JWT_INVALID");
      }

      const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;
      if (expiresAt <= Math.floor(now().getTime() / 1000)) {
        throw new Error("JWT_EXPIRED");
      }

      return {
        sub: payload.sub,
        permissions: payload.permissions,
        roles: payload.roles,
        authType: payload.authType,
        ...(payload.apiTokenId !== undefined ? { apiTokenId: payload.apiTokenId } : {})
      };
    }
  };
}

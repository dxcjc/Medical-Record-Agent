import type { FastifyInstance } from "fastify";

import type { AuthTokenPayload, JwtSigner } from "./auth.service";

export interface FastifyJwtSignerOptions {
  expiresIn: string;
}

/**
 * 将 @fastify/jwt 适配成 auth service 使用的最小 signer 接口。
 */
export function createFastifyJwtSigner(server: FastifyInstance, options: FastifyJwtSignerOptions): JwtSigner {
  return {
    async sign(payload: AuthTokenPayload) {
      return server.jwt.sign(payload, {
        expiresIn: options.expiresIn
      });
    },

    async verify(token: string) {
      const payload = await server.jwt.verify<AuthTokenPayload>(token);

      return {
        sub: payload.sub,
        permissions: payload.permissions,
        roles: payload.roles,
        authType: payload.authType,
        ...(payload.apiTokenId !== undefined ? { apiTokenId: payload.apiTokenId } : {})
      };
    },

    async verifySignature(token: string) {
      try {
        // @fastify/jwt verify 支持 ignoreExpiration 选项跳过过期检查
        const payload = await server.jwt.verify<AuthTokenPayload>(token, {
          ignoreExpiration: true
        } as Record<string, unknown>);

        if (!payload || typeof payload.sub !== "string") {
          return null;
        }

        return {
          sub: payload.sub,
          permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
          roles: Array.isArray(payload.roles) ? payload.roles : [],
          authType: payload.authType,
          ...(payload.apiTokenId !== undefined ? { apiTokenId: payload.apiTokenId } : {})
        };
      } catch {
        return null;
      }
    }
  };
}

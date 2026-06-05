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
    }
  };
}

import type { FastifyInstance } from "fastify";
import type { JwtSigner } from "./auth.service";
export interface FastifyJwtSignerOptions {
    expiresIn: string;
}
/**
 * 将 @fastify/jwt 适配成 auth service 使用的最小 signer 接口。
 */
export declare function createFastifyJwtSigner(server: FastifyInstance, options: FastifyJwtSignerOptions): JwtSigner;
//# sourceMappingURL=jwt.signer.d.ts.map
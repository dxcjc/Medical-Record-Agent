import type { JwtSigner } from "./auth.service";
export interface SimpleJwtSignerOptions {
    secret: string;
    expiresIn: string;
    now?: () => Date;
}
/**
 * 生产 bootstrap 使用的轻量 HS256 signer。
 * 它只实现本项目 auth service 需要的最小 JWT 能力，避免 createApiServer 之前必须先拿到 Fastify 实例。
 */
export declare function createSimpleJwtSigner(options: SimpleJwtSignerOptions): JwtSigner;
//# sourceMappingURL=simple-jwt.signer.d.ts.map
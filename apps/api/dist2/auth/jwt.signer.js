/**
 * 将 @fastify/jwt 适配成 auth service 使用的最小 signer 接口。
 */
export function createFastifyJwtSigner(server, options) {
    return {
        async sign(payload) {
            return server.jwt.sign(payload, {
                expiresIn: options.expiresIn
            });
        },
        async verify(token) {
            const payload = await server.jwt.verify(token);
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
//# sourceMappingURL=jwt.signer.js.map
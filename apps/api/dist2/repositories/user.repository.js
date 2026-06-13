/**
 * 创建用户仓储。
 * 这里不把 Prisma client 整体泄露给调用方，而是收敛成后续鉴权直接可用的业务契约。
 */
export function createUserRepository(dependencies) {
    const { user } = dependencies;
    return {
        /**
         * 按邮箱读取登录所需的最小安全信息。
         * 保留停用状态，交给上层决定是否允许继续登录。
         */
        async findAuthByEmail(email) {
            return user.findUnique({
                where: { email },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    passwordHash: true,
                    status: true,
                    roles: {
                        select: {
                            id: true,
                            name: true,
                            permissions: true
                        }
                    }
                }
            });
        },
        /**
         * 按用户 id 读取权限上下文，供会话鉴权、路由守卫和审计补充使用。
         */
        async findByIdWithRoles(id) {
            return user.findUnique({
                where: { id },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    status: true,
                    roles: {
                        select: {
                            id: true,
                            name: true,
                            permissions: true
                        }
                    }
                }
            });
        },
        /**
         * 更新启停状态时只允许改动状态字段，避免误触发认证相关敏感字段变更。
         */
        async updateStatus(input) {
            return user.update({
                where: { id: input.id },
                data: {
                    status: input.status
                },
                select: {
                    id: true,
                    status: true
                }
            });
        }
    };
}
//# sourceMappingURL=user.repository.js.map
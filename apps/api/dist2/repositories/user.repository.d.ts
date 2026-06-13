import type { PrismaClient } from "@prisma/client";
import { UserStatus } from "@prisma/client";
/**
 * 角色权限快照。
 * 这里直接保留 Prisma 返回的权限 JSON 结构，方便后续鉴权层按自身规则解析。
 */
export type UserRoleAccess = {
    id: string;
    name: string;
    permissions: unknown;
};
/**
 * 登录认证阶段需要的安全用户视图。
 * 这里只暴露密码哈希，不暴露任何密码明文或可逆敏感信息。
 */
export type AuthUser = {
    id: string;
    email: string;
    displayName: string;
    passwordHash: string;
    status: UserStatus;
    roles: UserRoleAccess[];
};
/**
 * 通用用户访问上下文。
 * 后续 JWT / RBAC 中间件可以直接复用该结构读取角色与权限。
 */
export type UserAccessContext = {
    id: string;
    email: string;
    displayName: string;
    status: UserStatus;
    roles: UserRoleAccess[];
};
type UserRepositoryDependencies = Pick<PrismaClient, "user">;
export type UpdateUserStatusInput = {
    id: string;
    status: UserStatus;
};
/**
 * 创建用户仓储。
 * 这里不把 Prisma client 整体泄露给调用方，而是收敛成后续鉴权直接可用的业务契约。
 */
export declare function createUserRepository(dependencies: UserRepositoryDependencies): {
    /**
     * 按邮箱读取登录所需的最小安全信息。
     * 保留停用状态，交给上层决定是否允许继续登录。
     */
    findAuthByEmail(email: string): Promise<AuthUser | null>;
    /**
     * 按用户 id 读取权限上下文，供会话鉴权、路由守卫和审计补充使用。
     */
    findByIdWithRoles(id: string): Promise<UserAccessContext | null>;
    /**
     * 更新启停状态时只允许改动状态字段，避免误触发认证相关敏感字段变更。
     */
    updateStatus(input: UpdateUserStatusInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.UserStatus;
    }>;
};
export {};
//# sourceMappingURL=user.repository.d.ts.map
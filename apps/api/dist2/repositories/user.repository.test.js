import { UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createUserRepository } from "./user.repository";
describe("user.repository", () => {
    it("按邮箱查询登录用户时应返回认证所需字段与角色权限，并保留停用状态供上层拦截", async () => {
        const user = {
            findUnique: vi.fn().mockResolvedValue({
                id: "user-001",
                email: "demo@example.com",
                displayName: "示例用户",
                passwordHash: "hashed-password",
                status: UserStatus.disabled,
                roles: [
                    {
                        id: "role-admin",
                        name: "admin",
                        permissions: ["auth.login", "audit.read"]
                    }
                ]
            })
        };
        const repository = createUserRepository({ user });
        const result = await repository.findAuthByEmail("demo@example.com");
        expect(user.findUnique).toHaveBeenCalledWith({
            where: { email: "demo@example.com" },
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
        expect(result).toEqual({
            id: "user-001",
            email: "demo@example.com",
            displayName: "示例用户",
            passwordHash: "hashed-password",
            status: UserStatus.disabled,
            roles: [
                {
                    id: "role-admin",
                    name: "admin",
                    permissions: ["auth.login", "audit.read"]
                }
            ]
        });
    });
    it("按 id 查询用户访问上下文时应携带角色权限，供后续鉴权直接使用", async () => {
        const user = {
            findUnique: vi.fn().mockResolvedValue({
                id: "user-002",
                email: "viewer@example.com",
                displayName: "查看者",
                status: UserStatus.active,
                roles: [
                    {
                        id: "role-viewer",
                        name: "viewer",
                        permissions: ["records.read"]
                    }
                ]
            })
        };
        const repository = createUserRepository({ user });
        const result = await repository.findByIdWithRoles("user-002");
        expect(user.findUnique).toHaveBeenCalledWith({
            where: { id: "user-002" },
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
        expect(result?.roles[0]?.permissions).toEqual(["records.read"]);
    });
    it("更新用户状态时应只写入状态字段，避免误改认证敏感数据", async () => {
        const user = {
            update: vi.fn().mockResolvedValue({
                id: "user-003",
                status: UserStatus.disabled
            })
        };
        const repository = createUserRepository({ user });
        await repository.updateStatus({
            id: "user-003",
            status: UserStatus.disabled
        });
        expect(user.update).toHaveBeenCalledWith({
            where: { id: "user-003" },
            data: {
                status: UserStatus.disabled
            },
            select: {
                id: true,
                status: true
            }
        });
    });
});
//# sourceMappingURL=user.repository.test.js.map
import type { Prisma, PrismaClient, ProviderConfigStatus, ProviderKind } from "@prisma/client";
type ProviderRepositoryDependencies = Pick<PrismaClient, "providerConfig">;
export interface SaveProviderConfigRepositoryInput {
    key: string;
    kind: ProviderKind;
    displayName: string;
    status: ProviderConfigStatus;
    isDefault: boolean;
    config: Prisma.InputJsonValue;
    secretRefs?: Prisma.InputJsonValue;
    updatedById?: string | null;
}
/**
 * Provider 配置仓库负责在线配置的持久化边界。
 * 这里不会保存真实密钥明文，只保存 secretRefs 这类“密钥引用名”，真实密钥仍由环境变量、
 * KMS 或部署平台托管，避免管理页面把生产凭据直接落库。
 */
export declare function createProviderRepository(dependencies: ProviderRepositoryDependencies): {
    list(): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.ProviderConfigStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        key: string;
        kind: import("@prisma/client").$Enums.ProviderKind;
        isDefault: boolean;
        config: Prisma.JsonValue;
        secretRefs: Prisma.JsonValue;
        updatedById: string | null;
    }[]>;
    findByKey(key: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.ProviderConfigStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        key: string;
        kind: import("@prisma/client").$Enums.ProviderKind;
        isDefault: boolean;
        config: Prisma.JsonValue;
        secretRefs: Prisma.JsonValue;
        updatedById: string | null;
    } | null>;
    save(input: SaveProviderConfigRepositoryInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.ProviderConfigStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        key: string;
        kind: import("@prisma/client").$Enums.ProviderKind;
        isDefault: boolean;
        config: Prisma.JsonValue;
        secretRefs: Prisma.JsonValue;
        updatedById: string | null;
    }>;
    setDefault(key: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.ProviderConfigStatus;
        createdAt: Date;
        displayName: string;
        updatedAt: Date;
        key: string;
        kind: import("@prisma/client").$Enums.ProviderKind;
        isDefault: boolean;
        config: Prisma.JsonValue;
        secretRefs: Prisma.JsonValue;
        updatedById: string | null;
    } | null>;
};
export {};
//# sourceMappingURL=provider.repository.d.ts.map
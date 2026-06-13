import type { FileVisibility, Prisma, PrismaClient } from "@prisma/client";
type FileRepositoryDependencies = Pick<PrismaClient, "storedFile">;
export interface CreateStoredFileInput {
    storageKey: string;
    originalName: string;
    mimeType: string;
    byteSize: bigint;
    checksumSha256: string;
    visibility?: FileVisibility;
    metadata?: Prisma.InputJsonValue;
    uploadedById?: string | null;
}
/**
 * 文件仓库只负责结构化元数据的持久化，不负责本地路径拼接、S3 URL 生成或文件字节读写。
 * 这样后续即便切换存储后端，调用方也仍然只看到 storageKey 这类稳定标识，不会拿到磁盘绝对路径。
 */
export declare function createFileRepository(dependencies: FileRepositoryDependencies): {
    create(input: CreateStoredFileInput): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        storageKey: string;
        originalName: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
        visibility: import("@prisma/client").$Enums.FileVisibility;
        deletedAt: Date | null;
        uploadedById: string | null;
    }>;
    findById(id: string): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        storageKey: string;
        originalName: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
        visibility: import("@prisma/client").$Enums.FileVisibility;
        deletedAt: Date | null;
        uploadedById: string | null;
    } | null>;
    findByStorageKey(storageKey: string): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        storageKey: string;
        originalName: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
        visibility: import("@prisma/client").$Enums.FileVisibility;
        deletedAt: Date | null;
        uploadedById: string | null;
    } | null>;
    listByUploader(uploadedById: string, limit?: number): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        storageKey: string;
        originalName: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
        visibility: import("@prisma/client").$Enums.FileVisibility;
        deletedAt: Date | null;
        uploadedById: string | null;
    }[]>;
    softDelete(id: string, deletedAt?: Date): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        storageKey: string;
        originalName: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
        visibility: import("@prisma/client").$Enums.FileVisibility;
        deletedAt: Date | null;
        uploadedById: string | null;
    }>;
};
export {};
//# sourceMappingURL=file.repository.d.ts.map
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
export function createFileRepository(dependencies: FileRepositoryDependencies) {
  return {
    async create(input: CreateStoredFileInput) {
      return dependencies.storedFile.create({
        data: {
          storageKey: input.storageKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          checksumSha256: input.checksumSha256,
          visibility: input.visibility ?? "private",
          metadata: input.metadata ?? {},
          uploadedById: input.uploadedById ?? null
        }
      });
    },

    async findById(id: string) {
      return dependencies.storedFile.findUnique({
        where: { id }
      });
    },

    async findByStorageKey(storageKey: string) {
      return dependencies.storedFile.findUnique({
        where: { storageKey }
      });
    },

    async listByUploader(uploadedById: string, limit = 20) {
      return dependencies.storedFile.findMany({
        where: {
          uploadedById,
          deletedAt: null
        },
        orderBy: {
          createdAt: "desc"
        },
        take: limit
      });
    },

    async softDelete(id: string, deletedAt = new Date()) {
      return dependencies.storedFile.update({
        where: { id },
        data: { deletedAt }
      });
    }
  };
}

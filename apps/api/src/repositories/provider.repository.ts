import type { Prisma, PrismaClient, ProviderConfigStatus, ProviderKind } from "@prisma/client";

type ProviderRepositoryDependencies = Pick<PrismaClient, "providerConfig"> & {
  $transaction: PrismaClient["$transaction"];
};

const providerConfigSelect = {
  id: true,
  key: true,
  kind: true,
  displayName: true,
  status: true,
  isDefault: true,
  config: true,
  secretRefs: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true
} as const;

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
export function createProviderRepository(dependencies: ProviderRepositoryDependencies) {
  const { providerConfig, $transaction } = dependencies;

  async function clearDefaultProviderOfSameKind(input: { key: string; kind: ProviderKind }) {
    await providerConfig.updateMany({
      where: {
        kind: input.kind,
        key: {
          not: input.key
        },
        isDefault: true
      },
      data: {
        isDefault: false
      }
    });
  }

  return {
    async list() {
      return providerConfig.findMany({
        select: providerConfigSelect,
        orderBy: [
          {
            kind: "asc"
          },
          {
            key: "asc"
          }
        ]
      });
    },

    async findByKey(key: string) {
      return providerConfig.findUnique({
        where: { key },
        select: providerConfigSelect
      });
    },

    async save(input: SaveProviderConfigRepositoryInput) {
      const data = {
        kind: input.kind,
        displayName: input.displayName,
        status: input.status,
        isDefault: input.isDefault,
        config: input.config,
        secretRefs: input.secretRefs ?? {},
        updatedById: input.updatedById ?? null
      };

      if (input.isDefault) {
        const result = await $transaction(async (tx) => {
          await tx.providerConfig.updateMany({
            where: {
              kind: input.kind,
              key: { not: input.key },
              isDefault: true
            },
            data: { isDefault: false }
          });

          return tx.providerConfig.upsert({
            where: { key: input.key },
            update: data,
            create: { key: input.key, ...data },
            select: providerConfigSelect
          });
        });

        return result;
      }

      return providerConfig.upsert({
        where: { key: input.key },
        update: data,
        create: { key: input.key, ...data },
        select: providerConfigSelect
      });
    },

    async setDefault(key: string) {
      const provider = await providerConfig.findUnique({
        where: { key },
        select: { key: true, kind: true }
      });

      if (!provider) {
        return null;
      }

      return $transaction(async (tx) => {
        await tx.providerConfig.updateMany({
          where: {
            kind: provider.kind,
            key: { not: provider.key },
            isDefault: true
          },
          data: { isDefault: false }
        });

        return tx.providerConfig.update({
          where: { key },
          data: { isDefault: true },
          select: providerConfigSelect
        });
      });
    }
  };
}

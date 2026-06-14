import type { Prisma, PrismaClient, RecognitionJobStatus } from "@prisma/client";

type JobsRepositoryDependencies = Pick<PrismaClient, "recognitionJob">;

const jobSelection = {
  id: true,
  status: true,
  schemaKey: true,
  schemaVersionId: true,
  sourceFileId: true,
  createdById: true,
  providerConfig: true,
  options: true,
  trace: true,
  warnings: true,
  error: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
} as const;

export interface CreateRecognitionJobInput {
  status?: RecognitionJobStatus;
  schemaKey: string;
  schemaVersionId?: string | null;
  sourceFileId?: string | null;
  createdById?: string | null;
  providerConfig?: Prisma.InputJsonValue;
  options?: Prisma.InputJsonValue;
}

export interface UpdateRecognitionJobStatusInput {
  id: string;
  status: RecognitionJobStatus;
  startedAt?: Date;
  completedAt?: Date;
  trace?: Prisma.InputJsonValue;
  warnings?: Prisma.InputJsonValue;
  error?: Prisma.InputJsonValue;
}

/**
 * 任务仓库承接识别任务生命周期的数据库操作。
 * 这里把状态更新和列表查询聚合在一起，后续工作流调度、任务路由和审计中间件都能直接复用。
 */
export function createJobsRepository(dependencies: JobsRepositoryDependencies) {
  return {
    async create(input: CreateRecognitionJobInput) {
      return dependencies.recognitionJob.create({
        data: {
          status: input.status ?? "queued",
          schemaKey: input.schemaKey,
          schemaVersionId: input.schemaVersionId ?? null,
          sourceFileId: input.sourceFileId ?? null,
          createdById: input.createdById ?? null,
          providerConfig: input.providerConfig ?? {},
          options: input.options ?? {},
          trace: [],
          warnings: []
        },
        select: jobSelection
      });
    },

    async findById(id: string) {
      return dependencies.recognitionJob.findUnique({
        where: { id },
        select: jobSelection
      });
    },

    async listByCreator(createdById: string, limit = 20) {
      return dependencies.recognitionJob.findMany({
        where: { createdById },
        select: jobSelection,
        orderBy: {
          createdAt: "desc"
        },
        take: limit
      });
    },

    async list(limit = 50) {
      return dependencies.recognitionJob.findMany({
        where: { deletedAt: null },
        select: jobSelection,
        orderBy: {
          createdAt: "desc"
        },
        take: limit
      });
    },

    async listPaginated(input: {
      skip: number;
      take: number;
      status?: string;
      schemaKey?: string;
      search?: string;
    }) {
      // 限制 search 参数长度，防止超长字符串导致查询性能问题
      const sanitizedSearch = input.search ? input.search.slice(0, 200) : undefined;
      const where: Prisma.RecognitionJobWhereInput = { deletedAt: null };

      if (input.status) {
        where.status = input.status as RecognitionJobStatus;
      }
      if (input.schemaKey) {
        where.schemaKey = input.schemaKey;
      }
      if (sanitizedSearch) {
        where.OR = [
          { id: { contains: sanitizedSearch, mode: "insensitive" } },
          { schemaKey: { contains: sanitizedSearch, mode: "insensitive" } }
        ];
      }

      const [items, total] = await Promise.all([
        dependencies.recognitionJob.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: input.skip,
          take: input.take,
          include: {
            schemaVersion: { select: { displayName: true } }
          }
        }),
        dependencies.recognitionJob.count({ where })
      ]);

      return { items, total };
    },

    async softDelete(id: string) {
      return dependencies.recognitionJob.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: { id: true }
      });
    },

    async listEligibleForWriteback(limit = 20) {
      return dependencies.recognitionJob.findMany({
        where: {
          status: {
            in: ["completed"]
          },
          result: {
            is: {
              reviewRequired: false
            }
          },
          writebacks: {
            none: {
              status: {
                in: ["pending", "running", "succeeded"]
              }
            }
          }
        },
        include: {
          result: true,
          writebacks: {
            orderBy: {
              attemptedAt: "desc"
            }
          }
        },
        orderBy: {
          completedAt: "desc"
        },
        take: limit
      });
    },

    async updateStatus(input: UpdateRecognitionJobStatusInput) {
      const data: Prisma.RecognitionJobUpdateInput = {
        status: input.status
      };

      if (input.startedAt !== undefined) {
        data.startedAt = input.startedAt;
      }

      if (input.completedAt !== undefined) {
        data.completedAt = input.completedAt;
      }

      if (input.trace !== undefined) {
        data.trace = input.trace;
      }

      if (input.warnings !== undefined) {
        data.warnings = input.warnings;
      }

      if (input.error !== undefined) {
        data.error = input.error;
      }

      return dependencies.recognitionJob.update({
        where: { id: input.id },
        data,
        select: jobSelection
      });
    }
  };
}

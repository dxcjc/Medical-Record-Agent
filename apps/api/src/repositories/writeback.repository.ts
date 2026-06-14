import type { Prisma, PrismaClient, WritebackStatus } from "@prisma/client";

type WritebackRepositoryDependencies = Pick<PrismaClient, "writebackAttempt">;

export interface CreateWritebackAttemptInput {
  jobId: string;
  targetSystem: string;
  endpoint: string;
  idempotencyKey: string;
  requestPayload: Prisma.InputJsonValue;
}

export interface CompleteWritebackAttemptInput {
  status: WritebackStatus;
  responsePayload?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  error?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  retryable: boolean;
  completedAt: Date;
}

/**
 * 写回仓库把“准备写回”和“写回完成”拆成两次显式持久化，
 * 这样失败重试、审计追踪和幂等键排查都能依赖同一张表。
 */
export function createWritebackRepository(dependencies: WritebackRepositoryDependencies) {
  return {
    async create(input: CreateWritebackAttemptInput) {
      return dependencies.writebackAttempt.create({
        data: {
          jobId: input.jobId,
          targetSystem: input.targetSystem,
          endpoint: input.endpoint,
          idempotencyKey: input.idempotencyKey,
          requestPayload: input.requestPayload
        }
      });
    },

    async findByIdempotencyKey(idempotencyKey: string) {
      return dependencies.writebackAttempt.findUnique({
        where: { idempotencyKey }
      });
    },

    async listByJobId(jobId: string) {
      return dependencies.writebackAttempt.findMany({
        where: { jobId },
        orderBy: {
          attemptedAt: "desc"
        }
      });
    },

    async complete(id: string, input: CompleteWritebackAttemptInput) {
      const data: Prisma.WritebackAttemptUpdateInput = {
        status: input.status,
        retryable: input.retryable,
        completedAt: input.completedAt
      };

      if (input.responsePayload !== undefined) {
        data.responsePayload = input.responsePayload;
      }

      if (input.error !== undefined) {
        data.error = input.error;
      }

      return dependencies.writebackAttempt.update({
        where: { id },
        data
      });
    },

    async listAll(input?: { page?: number; pageSize?: number }) {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        dependencies.writebackAttempt.findMany({
          orderBy: { attemptedAt: "desc" },
          skip,
          take: pageSize
        }),
        dependencies.writebackAttempt.count()
      ]);

      return { items, total, page, pageSize };
    }
  };
}

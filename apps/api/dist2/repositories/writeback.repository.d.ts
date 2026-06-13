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
export declare function createWritebackRepository(dependencies: WritebackRepositoryDependencies): {
    create(input: CreateWritebackAttemptInput): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }>;
    findByIdempotencyKey(idempotencyKey: string): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    } | null>;
    listByJobId(jobId: string): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }[]>;
    complete(id: string, input: CompleteWritebackAttemptInput): Promise<{
        error: Prisma.JsonValue | null;
        id: string;
        status: import("@prisma/client").$Enums.WritebackStatus;
        completedAt: Date | null;
        jobId: string;
        attemptedAt: Date;
        targetSystem: string;
        endpoint: string;
        idempotencyKey: string;
        requestPayload: Prisma.JsonValue;
        responsePayload: Prisma.JsonValue | null;
        retryable: boolean;
    }>;
};
export {};
//# sourceMappingURL=writeback.repository.d.ts.map
import type { Prisma, PrismaClient, RecognitionJobStatus } from "@prisma/client";
type JobsRepositoryDependencies = Pick<PrismaClient, "recognitionJob">;
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
export declare function createJobsRepository(dependencies: JobsRepositoryDependencies): {
    create(input: CreateRecognitionJobInput): Promise<{
        error: Prisma.JsonValue;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    }>;
    findById(id: string): Promise<{
        error: Prisma.JsonValue;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    } | null>;
    listByCreator(createdById: string, limit?: number): Promise<{
        error: Prisma.JsonValue;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    }[]>;
    list(limit?: number): Promise<{
        error: Prisma.JsonValue;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    }[]>;
    listEligibleForWriteback(limit?: number): Promise<({
        result: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            jobId: string;
            fields: Prisma.JsonValue;
            normalizedFields: Prisma.JsonValue;
            evidence: Prisma.JsonValue;
            payload: Prisma.JsonValue;
            confidence: Prisma.Decimal | null;
            reviewRequired: boolean;
        } | null;
        writebacks: {
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
        }[];
    } & {
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    })[]>;
    updateStatus(input: UpdateRecognitionJobStatusInput): Promise<{
        error: Prisma.JsonValue;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.RecognitionJobStatus;
        createdAt: Date;
        updatedAt: Date;
        options: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
        schemaKey: string;
        trace: Prisma.JsonValue;
        warnings: Prisma.JsonValue;
        sourceFileId: string | null;
    }>;
};
export {};
//# sourceMappingURL=jobs.repository.d.ts.map
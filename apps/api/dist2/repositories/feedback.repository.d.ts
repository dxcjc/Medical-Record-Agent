import type { FeedbackStatus, Prisma, PrismaClient } from "@prisma/client";
type FeedbackRepositoryDependencies = Pick<PrismaClient, "feedbackSubmission">;
export interface CreateFeedbackInput {
    jobId: string;
    schemaVersionId?: string | null;
    submittedById?: string | null;
    fieldKey?: string | null;
    originalValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    correctedValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    comment?: string | null;
    metadata?: Prisma.InputJsonValue;
}
/**
 * 反馈仓库承接人工纠偏数据，为后续规则候选、评估集回流和人工审核界面提供统一入口。
 */
export declare function createFeedbackRepository(dependencies: FeedbackRepositoryDependencies): {
    create(input: CreateFeedbackInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.FeedbackStatus;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        schemaVersionId: string | null;
        fieldKey: string | null;
        originalValue: Prisma.JsonValue | null;
        correctedValue: Prisma.JsonValue | null;
        comment: string | null;
        reviewedAt: Date | null;
        jobId: string;
        submittedById: string | null;
    }>;
    listByJobId(jobId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.FeedbackStatus;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        schemaVersionId: string | null;
        fieldKey: string | null;
        originalValue: Prisma.JsonValue | null;
        correctedValue: Prisma.JsonValue | null;
        comment: string | null;
        reviewedAt: Date | null;
        jobId: string;
        submittedById: string | null;
    }[]>;
    markReviewed(id: string, reviewedAt: Date, status?: FeedbackStatus): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.FeedbackStatus;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        schemaVersionId: string | null;
        fieldKey: string | null;
        originalValue: Prisma.JsonValue | null;
        correctedValue: Prisma.JsonValue | null;
        comment: string | null;
        reviewedAt: Date | null;
        jobId: string;
        submittedById: string | null;
    }>;
};
export {};
//# sourceMappingURL=feedback.repository.d.ts.map
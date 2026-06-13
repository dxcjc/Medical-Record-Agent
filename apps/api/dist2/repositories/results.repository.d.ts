import type { Prisma, PrismaClient } from "@prisma/client";
type ResultsRepositoryDependencies = Pick<PrismaClient, "recognitionResult">;
export interface UpsertRecognitionResultInput {
    jobId: string;
    fields: Prisma.InputJsonValue;
    normalizedFields?: Prisma.InputJsonValue;
    evidence?: Prisma.InputJsonValue;
    payload?: Prisma.InputJsonValue;
    confidence?: number | null;
    reviewRequired: boolean;
}
/**
 * 结果仓库按 jobId 做单结果 upsert，保证同一个识别任务始终只有一份当前结果。
 * 这样后续重跑任务或补充字段时，不需要调用方自己判断 create 还是 update。
 */
export declare function createResultsRepository(dependencies: ResultsRepositoryDependencies): {
    findByJobId(jobId: string): Promise<{
        id: string;
        jobId: string;
        fields: Prisma.JsonValue;
        normalizedFields: Prisma.JsonValue;
        evidence: Prisma.JsonValue;
        payload: Prisma.JsonValue;
        confidence: Prisma.Decimal | null;
        reviewRequired: boolean;
    } | null>;
    upsertByJobId(input: UpsertRecognitionResultInput): Promise<{
        id: string;
        jobId: string;
        fields: Prisma.JsonValue;
        normalizedFields: Prisma.JsonValue;
        evidence: Prisma.JsonValue;
        payload: Prisma.JsonValue;
        confidence: Prisma.Decimal | null;
        reviewRequired: boolean;
    }>;
};
export {};
//# sourceMappingURL=results.repository.d.ts.map
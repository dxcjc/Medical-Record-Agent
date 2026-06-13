import type { EvaluationDatasetStatus, EvaluationRunStatus, Prisma, PrismaClient } from "@prisma/client";
type EvaluationRepositoryDependencies = Pick<PrismaClient, "evaluationDataset" | "evaluationSample" | "evaluationRun" | "evaluationMetric">;
export interface CreateEvaluationDatasetInput {
    key: string;
    displayName: string;
    description?: string | null;
    status?: EvaluationDatasetStatus;
    deidentified?: boolean;
    metadata?: Prisma.InputJsonValue;
}
export interface AddEvaluationSampleInput {
    datasetId: string;
    fileId?: string | null;
    recognitionJobId?: string | null;
    externalId?: string | null;
    groundTruth: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
}
export interface CreateEvaluationRunInput {
    datasetId: string;
    schemaVersionId?: string | null;
    createdById?: string | null;
    schemaConfig?: Prisma.InputJsonValue;
    providerConfig?: Prisma.InputJsonValue;
}
export interface CompleteEvaluationRunInput {
    status: EvaluationRunStatus;
    summary: Prisma.InputJsonValue;
    error?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    schemaVersionId?: string | null;
    completedAt: Date;
}
export interface FindEvaluationRunByIdInput {
    id: string;
    actorUserId?: string;
}
export interface UpsertEvaluationMetricInput {
    runId: string;
    name: string;
    value: Prisma.Decimal | Prisma.DecimalJsLike | number | string;
    unit?: string | null;
    breakdown?: Prisma.InputJsonValue;
}
/**
 * 评估仓库围绕 dataset、sample、run 三个层级提供持久化接口，
 * 便于后续离线评估、结果回放和指标查询统一落在同一处维护。
 */
export declare function createEvaluationRepository(dependencies: EvaluationRepositoryDependencies): {
    listDatasets(): Promise<({
        _count: {
            samples: number;
            runs: number;
        };
    } & {
        id: string;
        status: import("@prisma/client").$Enums.EvaluationDatasetStatus;
        createdAt: Date;
        displayName: string;
        metadata: Prisma.JsonValue;
        updatedAt: Date;
        description: string | null;
        key: string;
        deidentified: boolean;
    })[]>;
    findDatasetById(id: string): Promise<({
        _count: {
            samples: number;
            runs: number;
        };
    } & {
        id: string;
        status: import("@prisma/client").$Enums.EvaluationDatasetStatus;
        createdAt: Date;
        displayName: string;
        metadata: Prisma.JsonValue;
        updatedAt: Date;
        description: string | null;
        key: string;
        deidentified: boolean;
    }) | null>;
    createDataset(input: CreateEvaluationDatasetInput): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.EvaluationDatasetStatus;
        createdAt: Date;
        displayName: string;
        metadata: Prisma.JsonValue;
        updatedAt: Date;
        description: string | null;
        key: string;
        deidentified: boolean;
    }>;
    addSample(input: AddEvaluationSampleInput): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        externalId: string | null;
        groundTruth: Prisma.JsonValue;
        datasetId: string;
        fileId: string | null;
        recognitionJobId: string | null;
    }>;
    listSamples(datasetId: string, limit?: number): Promise<{
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue;
        externalId: string | null;
        groundTruth: Prisma.JsonValue;
        datasetId: string;
        fileId: string | null;
        recognitionJobId: string | null;
    }[]>;
    createRun(input: CreateEvaluationRunInput): Promise<{
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.EvaluationRunStatus;
        createdAt: Date;
        datasetId: string;
        summary: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
    }>;
    findRunById(input: FindEvaluationRunByIdInput): Promise<({
        dataset: {
            id: string;
            status: import("@prisma/client").$Enums.EvaluationDatasetStatus;
            createdAt: Date;
            displayName: string;
            metadata: Prisma.JsonValue;
            updatedAt: Date;
            description: string | null;
            key: string;
            deidentified: boolean;
        };
        metrics: {
            name: string;
            id: string;
            createdAt: Date;
            value: Prisma.Decimal;
            runId: string;
            unit: string | null;
            breakdown: Prisma.JsonValue;
        }[];
    } & {
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.EvaluationRunStatus;
        createdAt: Date;
        datasetId: string;
        summary: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
    }) | null>;
    markRunStarted(id: string, startedAt: Date): Promise<{
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.EvaluationRunStatus;
        createdAt: Date;
        datasetId: string;
        summary: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
    }>;
    completeRun(id: string, input: CompleteEvaluationRunInput): Promise<{
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.EvaluationRunStatus;
        createdAt: Date;
        datasetId: string;
        summary: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
    }>;
    upsertMetric(input: UpsertEvaluationMetricInput): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        value: Prisma.Decimal;
        runId: string;
        unit: string | null;
        breakdown: Prisma.JsonValue;
    }>;
    listMetrics(runId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        value: Prisma.Decimal;
        runId: string;
        unit: string | null;
        breakdown: Prisma.JsonValue;
    }[]>;
    listRunsByDataset(datasetId: string): Promise<{
        error: Prisma.JsonValue | null;
        providerConfig: Prisma.JsonValue;
        id: string;
        status: import("@prisma/client").$Enums.EvaluationRunStatus;
        createdAt: Date;
        datasetId: string;
        summary: Prisma.JsonValue;
        startedAt: Date | null;
        completedAt: Date | null;
        schemaVersionId: string | null;
        createdById: string | null;
    }[]>;
};
export {};
//# sourceMappingURL=evaluation.repository.d.ts.map
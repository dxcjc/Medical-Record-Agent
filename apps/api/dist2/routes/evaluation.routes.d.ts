import type { FastifyInstance } from "fastify";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import { type ApiRouteResponseObject, type EvaluationSampleRouteInput } from "./route-dtos";
export interface CreateEvaluationRunInput {
    datasetId: string;
    schemaKey?: string;
    schemaVersionId?: string;
    providerKey: string;
    sampleLimit?: number;
    actor: AuthContext;
}
export interface CreateEvaluationDatasetRouteInput {
    key: string;
    displayName: string;
    description?: string;
    deidentified: boolean;
    metadata?: unknown;
    actor: AuthContext;
}
export interface ImportEvaluationSamplesRouteInput {
    datasetId: string;
    samples: EvaluationSampleRouteInput[];
    actor: AuthContext;
}
export interface ListEvaluationRunsRouteInput {
    datasetId?: string;
    actor: AuthContext;
}
export interface GetEvaluationRunInput {
    id: string;
    actor: AuthContext;
}
export interface ListEvaluationRunMetricsInput {
    runId: string;
    actor: AuthContext;
}
export interface EvaluationRouteService {
    listDatasets(): Promise<ApiRouteResponseObject[]>;
    createDataset(input: CreateEvaluationDatasetRouteInput): Promise<ApiRouteResponseObject>;
    importSamples(input: ImportEvaluationSamplesRouteInput): Promise<ApiRouteResponseObject[]>;
    listRuns(input: ListEvaluationRunsRouteInput): Promise<ApiRouteResponseObject[]>;
    createRun(input: CreateEvaluationRunInput): Promise<ApiRouteResponseObject>;
    getRun(input: GetEvaluationRunInput): Promise<ApiRouteResponseObject | null>;
    listRunMetrics(input: ListEvaluationRunMetricsInput): Promise<ApiRouteResponseObject[]>;
}
export interface EvaluationRoutesDependencies {
    evaluationService: EvaluationRouteService;
    authHooks: ReturnType<typeof createAuthHooks>;
}
/**
 * Evaluation API 管理评估数据集和评估运行，属于高权限管理能力。
 * 这里通过注入的 evaluationService 完成业务动作，路由层不直接连接数据库。
 */
export declare function registerEvaluationRoutes(server: FastifyInstance, dependencies: EvaluationRoutesDependencies): Promise<void>;
//# sourceMappingURL=evaluation.routes.d.ts.map
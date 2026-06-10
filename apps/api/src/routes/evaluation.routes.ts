import type { FastifyInstance } from "fastify";

import { PERMISSIONS } from "../auth/permissions";
import type { AuthContext, createAuthHooks } from "../middleware/auth.middleware";
import {
  assertRouteResponseObject,
  assertRouteResponseObjectList,
  importEvaluationSamplesRouteInputSchema,
  type ApiRouteResponseObject,
  type EvaluationSampleRouteInput
} from "./route-dtos";

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

function isCreateRunBody(
  value: unknown
): value is { datasetId: string; schemaKey?: string; schemaVersionId?: string; providerKey: string; sampleLimit?: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  const sampleLimit = body.sampleLimit;
  const schemaKey = body.schemaKey;
  const schemaVersionId = body.schemaVersionId;

  return (
    typeof body.datasetId === "string" &&
    body.datasetId.length > 0 &&
    typeof body.providerKey === "string" &&
    body.providerKey.length > 0 &&
    (schemaKey === undefined || (typeof schemaKey === "string" && schemaKey.length > 0)) &&
    (schemaVersionId === undefined || (typeof schemaVersionId === "string" && schemaVersionId.length > 0)) &&
    (sampleLimit === undefined || (typeof sampleLimit === "number" && Number.isFinite(sampleLimit)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCreateDatasetBody(
  value: unknown
): value is { key: string; displayName: string; description?: string; deidentified: boolean; metadata?: unknown } {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.key === "string" &&
    value.key.length > 0 &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0 &&
    typeof value.deidentified === "boolean" &&
    (value.description === undefined || typeof value.description === "string")
  );
}

/**
 * Evaluation API 管理评估数据集和评估运行，属于高权限管理能力。
 * 这里通过注入的 evaluationService 完成业务动作，路由层不直接连接数据库。
 */
export async function registerEvaluationRoutes(server: FastifyInstance, dependencies: EvaluationRoutesDependencies) {
  const preHandler = [
    dependencies.authHooks.authenticate,
    dependencies.authHooks.requirePermission(PERMISSIONS.evaluationManage)
  ];

  server.get(
    "/evaluations/datasets",
    {
      preHandler
    },
    async () => {
      const datasets = await dependencies.evaluationService.listDatasets();

      return {
        items: assertRouteResponseObjectList(datasets, "EVALUATION_DATASET_LIST_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/evaluations/datasets",
    {
      preHandler
    },
    async (request, reply) => {
      if (!isCreateDatasetBody(request.body)) {
        return reply.status(400).send({
          error: "BAD_REQUEST"
        });
      }

      const input: CreateEvaluationDatasetRouteInput = {
        key: request.body.key,
        displayName: request.body.displayName,
        deidentified: request.body.deidentified,
        metadata: request.body.metadata,
        actor: request.auth as AuthContext
      };

      if (request.body.description !== undefined) {
        input.description = request.body.description;
      }

      const dataset = await dependencies.evaluationService.createDataset(input);

      return reply.status(201).send({
        dataset: assertRouteResponseObject(dataset, "EVALUATION_DATASET_RESPONSE_INVALID")
      });
    }
  );

  server.post(
    "/evaluations/datasets/:id/samples",
    {
      preHandler
    },
    async (request, reply) => {
      const parsed = importEvaluationSamplesRouteInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "BAD_REQUEST"
        });
      }

      const params = request.params as { id: string };
      const samples = await dependencies.evaluationService.importSamples({
        datasetId: params.id,
        samples: parsed.data.samples,
        actor: request.auth as AuthContext
      });

      return reply.status(201).send({
        samples: assertRouteResponseObjectList(samples, "EVALUATION_SAMPLE_IMPORT_RESPONSE_INVALID")
      });
    }
  );

  server.get(
    "/evaluations/runs",
    {
      preHandler
    },
    async (request) => {
      const query = request.query as { datasetId?: string };
      const input: ListEvaluationRunsRouteInput = {
        actor: request.auth as AuthContext
      };

      if (typeof query.datasetId === "string" && query.datasetId.length > 0) {
        input.datasetId = query.datasetId;
      }

      const runs = await dependencies.evaluationService.listRuns(input);

      return {
        items: assertRouteResponseObjectList(runs, "EVALUATION_RUN_LIST_RESPONSE_INVALID")
      };
    }
  );

  server.post(
    "/evaluations/runs",
    {
      preHandler
    },
    async (request, reply) => {
      if (!isCreateRunBody(request.body)) {
        return reply.status(400).send({
          error: "BAD_REQUEST"
        });
      }

      const input: CreateEvaluationRunInput = {
        datasetId: request.body.datasetId,
        providerKey: request.body.providerKey,
        actor: request.auth as AuthContext
      };

      if (request.body.schemaKey !== undefined) {
        input.schemaKey = request.body.schemaKey;
      }

      if (request.body.schemaVersionId !== undefined) {
        input.schemaVersionId = request.body.schemaVersionId;
      }

      if (request.body.sampleLimit !== undefined) {
        input.sampleLimit = request.body.sampleLimit;
      }

      const run = await dependencies.evaluationService.createRun(input);

      return reply.status(201).send({
        run: assertRouteResponseObject(run, "EVALUATION_RUN_RESPONSE_INVALID")
      });
    }
  );

  server.get(
    "/evaluations/runs/:id/metrics",
    {
      preHandler
    },
    async (request) => {
      const params = request.params as { id: string };
      const metrics = await dependencies.evaluationService.listRunMetrics({
        runId: params.id,
        actor: request.auth as AuthContext
      });

      return {
        metrics: assertRouteResponseObjectList(metrics, "EVALUATION_METRIC_LIST_RESPONSE_INVALID")
      };
    }
  );

  server.get(
    "/evaluations/runs/:id",
    {
      preHandler
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const run = await dependencies.evaluationService.getRun({
        id: params.id,
        actor: request.auth as AuthContext
      });

      if (!run) {
        return reply.status(404).send({
          error: "EVALUATION_RUN_NOT_FOUND"
        });
      }

      return {
        run: assertRouteResponseObject(run, "EVALUATION_RUN_RESPONSE_INVALID")
      };
    }
  );
}

import type { EvaluationDatasetStatus, EvaluationRunStatus, Prisma, PrismaClient } from "@prisma/client";

type EvaluationRepositoryDependencies = Pick<
  PrismaClient,
  "evaluationDataset" | "evaluationSample" | "evaluationRun" | "evaluationMetric"
>;

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
export function createEvaluationRepository(dependencies: EvaluationRepositoryDependencies) {
  return {
    async listDatasets(input?: { page?: number; pageSize?: number }) {
      const page = input?.page ?? 1;
      const pageSize = Math.min(input?.pageSize ?? 50, 100);
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        dependencies.evaluationDataset.findMany({
          include: {
            _count: {
              select: {
                samples: true,
                runs: true
              }
            }
          },
          orderBy: [
            { updatedAt: "desc" },
            { createdAt: "desc" }
          ],
          skip,
          take: pageSize
        }),
        dependencies.evaluationDataset.count()
      ]);

      return { items, total, page, pageSize };
    },

    async findDatasetById(id: string) {
      return dependencies.evaluationDataset.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              samples: true,
              runs: true
            }
          }
        }
      });
    },

    async createDataset(input: CreateEvaluationDatasetInput) {
      return dependencies.evaluationDataset.create({
        data: {
          key: input.key,
          displayName: input.displayName,
          description: input.description ?? null,
          status: input.status ?? "draft",
          deidentified: input.deidentified ?? false,
          metadata: input.metadata ?? {}
        }
      });
    },

    async addSample(input: AddEvaluationSampleInput) {
      return dependencies.evaluationSample.create({
        data: {
          datasetId: input.datasetId,
          fileId: input.fileId ?? null,
          recognitionJobId: input.recognitionJobId ?? null,
          externalId: input.externalId ?? null,
          groundTruth: input.groundTruth,
          metadata: input.metadata ?? {}
        }
      });
    },

    async listSamples(datasetId: string, limit?: number) {
      return dependencies.evaluationSample.findMany({
        where: { datasetId },
        orderBy: {
          createdAt: "asc"
        },
        ...(limit === undefined ? {} : { take: limit })
      });
    },

    async createRun(input: CreateEvaluationRunInput) {
      return dependencies.evaluationRun.create({
        data: {
          datasetId: input.datasetId,
          schemaVersionId: input.schemaVersionId ?? null,
          createdById: input.createdById ?? null,
          providerConfig: input.providerConfig ?? {}
        }
      });
    },

    async findRunById(input: FindEvaluationRunByIdInput) {
      const run = await dependencies.evaluationRun.findUnique({
        where: { id: input.id },
        include: {
          dataset: true,
          metrics: {
            orderBy: {
              name: "asc"
            }
          }
        }
      });

      // 评估运行只允许创建者读取；未传 actorUserId 时保留仓库内部调用的直接查询能力。
      if (run && input.actorUserId && run.createdById && run.createdById !== input.actorUserId) {
        return null;
      }

      return run;
    },

    async markRunStarted(id: string, startedAt: Date) {
      return dependencies.evaluationRun.update({
        where: { id },
        data: {
          status: "running",
          startedAt
        }
      });
    },

    async completeRun(id: string, input: CompleteEvaluationRunInput) {
      const data: Prisma.EvaluationRunUpdateInput = {
        status: input.status,
        summary: input.summary,
        completedAt: input.completedAt
      };

      if (input.error !== undefined) {
        data.error = input.error;
      }
      if (input.schemaVersionId !== undefined) {
        data.schemaVersion = input.schemaVersionId === null ? { disconnect: true } : { connect: { id: input.schemaVersionId } };
      }

      return dependencies.evaluationRun.update({
        where: { id },
        data
      });
    },

    async upsertMetric(input: UpsertEvaluationMetricInput) {
      const data = {
        value: input.value,
        unit: input.unit ?? null,
        breakdown: input.breakdown ?? {}
      };

      return dependencies.evaluationMetric.upsert({
        where: {
          runId_name: {
            runId: input.runId,
            name: input.name
          }
        },
        update: data,
        create: {
          runId: input.runId,
          name: input.name,
          ...data
        }
      });
    },

    async listMetrics(runId: string) {
      return dependencies.evaluationMetric.findMany({
        where: { runId },
        orderBy: {
          name: "asc"
        }
      });
    },

    async listRunsByDataset(datasetId: string, input?: { page?: number; pageSize?: number }) {
      const page = input?.page ?? 1;
      const pageSize = Math.min(input?.pageSize ?? 50, 100);
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        dependencies.evaluationRun.findMany({
          where: { datasetId },
          orderBy: {
            createdAt: "desc"
          },
          skip,
          take: pageSize
        }),
        dependencies.evaluationRun.count({
          where: { datasetId }
        })
      ]);

      return { items, total, page, pageSize };
    },

    async listAllRuns(input?: { page?: number; pageSize?: number }) {
      const page = input?.page ?? 1;
      const pageSize = Math.min(input?.pageSize ?? 50, 100);
      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        dependencies.evaluationRun.findMany({
          orderBy: {
            createdAt: "desc"
          },
          include: {
            dataset: true
          },
          skip,
          take: pageSize
        }),
        dependencies.evaluationRun.count()
      ]);

      return { items, total, page, pageSize };
    },

    /**
     * 查找指定 schemaKey 的最新已完成评测运行。
     *
     * schemaKey 存储在 SchemaVersion 上（而非 EvaluationDataset），
     * EvaluationRun 通过 schemaVersionId 关联到 SchemaVersion。
     * EvaluationRun 没有 `result` 字段；完整的运行结果（含 summary、
     * sampleResults、warnings、errors）平铺存储在 `summary` JSON 字段中
     * （见 api-services.ts 中的 toEvaluationRunSummary）。
     * 这里将 `summary` 映射为 `result` 属性以保持消费者接口兼容。
     */
    async findLatestCompletedRunBySchema(schemaKey: string) {
      const run = await dependencies.evaluationRun.findFirst({
        where: {
          status: "completed",
          schemaVersion: { schemaKey }
        },
        include: {
          dataset: true,
          schemaVersion: true,
          metrics: {
            orderBy: { name: "asc" }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      if (!run) return null;
      return {
        ...run,
        result: run.summary
      };
    }
  };
}

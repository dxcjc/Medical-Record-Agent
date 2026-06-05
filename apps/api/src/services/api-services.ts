import type { Prisma } from "@prisma/client";

import type { AuthLayerService } from "../middleware/auth.middleware";
import type { AuditRecorder } from "../middleware/audit.middleware";
import type { AuditRouteService } from "../routes/audit.routes";
import type { AuthRouteService } from "../routes/auth.routes";
import type { ProviderRouteService, SetDefaultProviderInput } from "../routes/providers.routes";
import type {
  CreateEvaluationDatasetRouteInput,
  CreateEvaluationRunInput,
  EvaluationRouteService,
  GetEvaluationRunInput,
  ImportEvaluationSamplesRouteInput,
  ListEvaluationRunMetricsInput,
  ListEvaluationRunsRouteInput
} from "../routes/evaluation.routes";
import type { SchemaRouteService } from "../routes/schemas.routes";
import type { ApiServerServices } from "../server";

export interface ApiRecognitionDocumentInput {
  documentId: string;
  fileName?: string;
  mimeType?: string;
  content?: Uint8Array;
  storageKey?: string;
}

export interface ApiRecognitionOrchestratorResult {
  jobId: string;
  status: string;
  trace: unknown[];
  validation: {
    fieldResults: unknown[];
    normalizedCandidates: unknown[];
  };
  extraction?: {
    candidates: unknown[];
  };
  error?: unknown;
}

export interface ApiRecognitionOrchestrator {
  start(input: {
    jobId: string;
    document: ApiRecognitionDocumentInput;
  }): Promise<ApiRecognitionOrchestratorResult>;
}

export interface ApiServiceRepositories {
  schemaRepository: {
    listActive(): Promise<unknown[]>;
  };
  fileRepository: {
    create(input: {
      storageKey: string;
      originalName: string;
      mimeType: string;
      byteSize: bigint;
      checksumSha256: string;
      metadata?: Prisma.InputJsonValue;
      uploadedById?: string | null;
    }): Promise<unknown>;
  };
  jobsRepository: {
    create(input: {
      schemaKey: string;
      sourceFileId?: string | null;
      schemaVersionId?: string | null;
      createdById?: string | null;
      providerConfig?: Prisma.InputJsonValue;
      options?: Prisma.InputJsonValue;
    }): Promise<{ id: string; status?: string } & Record<string, unknown>>;
    findById(id: string): Promise<unknown | null>;
  };
  resultsRepository: {
    findByJobId(jobId: string): Promise<unknown | null>;
    upsertByJobId(input: {
      jobId: string;
      fields: Prisma.InputJsonValue;
      normalizedFields?: Prisma.InputJsonValue;
      evidence?: Prisma.InputJsonValue;
      payload?: Prisma.InputJsonValue;
      confidence?: number | null;
      reviewRequired: boolean;
    }): Promise<unknown>;
  };
  feedbackRepository: {
    create(input: unknown): Promise<unknown>;
  };
  writebackRepository: {
    create(input: {
      jobId: string;
      targetSystem: string;
      endpoint: string;
      idempotencyKey: string;
      requestPayload: Prisma.InputJsonValue;
    }): Promise<{ id: string } & Record<string, unknown>>;
    complete(
      id: string,
      input: {
        status: "succeeded" | "failed" | "skipped";
        responsePayload?: Prisma.InputJsonValue;
        error?: Prisma.InputJsonValue;
        retryable: boolean;
        completedAt: Date;
      }
    ): Promise<unknown>;
  };
  evaluationRepository: {
    listDatasets(): Promise<unknown[]>;
    createDataset(input: {
      key: string;
      displayName: string;
      description?: string | null;
      deidentified?: boolean;
      metadata?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    findDatasetById(id: string): Promise<unknown | null>;
    addSample(input: {
      datasetId: string;
      fileId?: string | null;
      recognitionJobId?: string | null;
      externalId?: string | null;
      groundTruth: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    listRunsByDataset(datasetId: string): Promise<unknown[]>;
    createRun(input: {
      datasetId: string;
      createdById?: string | null;
      providerConfig?: Prisma.InputJsonValue;
    }): Promise<unknown>;
    findRunById(input: { id: string; actorUserId: string }): Promise<unknown | null>;
    listMetrics(runId: string): Promise<unknown[]>;
  };
}

export interface ProviderRegistry {
  list(): Promise<unknown[]>;
  setDefault(key: string, input: SetDefaultProviderInput): Promise<unknown>;
}

export interface CreateApiServicesOptions {
  authService: AuthLayerService & AuthRouteService;
  auditService: AuditRouteService & {
    record: AuditRecorder;
  };
  schemaService: SchemaRouteService;
  repositories: ApiServiceRepositories;
  recognitionOrchestrator: ApiRecognitionOrchestrator;
  providerRegistry: ProviderRegistry;
  now?: () => Date;
}

function toStorageKey(originalName: string, now: Date) {
  const safeName = originalName.replace(/[^\w.-]+/g, "_");
  return `uploads/${now.toISOString().slice(0, 10)}/${safeName}`;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function toResultFields(result: ApiRecognitionOrchestratorResult): Prisma.InputJsonValue {
  return (result.extraction?.candidates ?? []) as Prisma.InputJsonValue;
}

function toResultEvidence(result: ApiRecognitionOrchestratorResult): Prisma.InputJsonValue {
  return (result.validation.fieldResults ?? []) as Prisma.InputJsonValue;
}

function readSampleRecord(sample: unknown) {
  return isRecord(sample) ? sample : {};
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function shouldReviewResult(result: ApiRecognitionOrchestratorResult) {
  return result.status === "needs_review" || result.status === "partial_completed" || Boolean(result.error);
}

function createApiServiceError(code: string, statusCode: number) {
  return Object.assign(new Error(code), {
    code,
    statusCode
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDeidentifiedFlag(value: unknown) {
  return isRecord(value) && value.deidentified === true;
}

function readSourceType(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.sourceType === "string" ? value.sourceType : undefined;
}

function isRealSampleMetadata(metadata: unknown) {
  const sourceType = readSourceType(metadata);
  return sourceType === "real" || sourceType === "real_deidentified";
}

async function assertDatasetAllowsEvaluationSamples(
  repository: ApiServiceRepositories["evaluationRepository"],
  input: ImportEvaluationSamplesRouteInput
) {
  const dataset = await repository.findDatasetById(input.datasetId);
  if (!readDeidentifiedFlag(dataset)) {
    throw createApiServiceError("EVALUATION_DATASET_NOT_DEIDENTIFIED", 409);
  }

  for (const sample of input.samples) {
    const metadata = isRecord(sample) ? sample.metadata : undefined;
    if (isRealSampleMetadata(metadata) && !readDeidentifiedFlag(metadata)) {
      throw createApiServiceError("EVALUATION_SAMPLE_NOT_DEIDENTIFIED", 409);
    }
  }
}

/**
 * 把生产依赖组合成 API route 可消费的 service 集合。
 * 路由层仍然只依赖 service 接口；这里集中连接 repositories、core orchestrator 和 provider registry。
 */
export function createApiServices(options: CreateApiServicesOptions): ApiServerServices {
  const now = options.now ?? (() => new Date());
  const repositories = options.repositories;

  const providerService: ProviderRouteService = {
    listProviders() {
      return options.providerRegistry.list();
    },
    setDefaultProvider(input) {
      return options.providerRegistry.setDefault(input.key, input);
    }
  };

  const evaluationService: EvaluationRouteService = {
    listDatasets() {
      return repositories.evaluationRepository.listDatasets();
    },
    createDataset(input: CreateEvaluationDatasetRouteInput) {
      const payload: Parameters<typeof repositories.evaluationRepository.createDataset>[0] = {
        key: input.key,
        displayName: input.displayName,
        deidentified: input.deidentified,
        metadata: toInputJsonValue(input.metadata)
      };

      if (input.description !== undefined) {
        payload.description = input.description;
      }

      return repositories.evaluationRepository.createDataset(payload);
    },
    async importSamples(input: ImportEvaluationSamplesRouteInput) {
      await assertDatasetAllowsEvaluationSamples(repositories.evaluationRepository, input);

      return Promise.all(
        input.samples.map((sample) => {
          const record = readSampleRecord(sample);

          return repositories.evaluationRepository.addSample({
            datasetId: input.datasetId,
            externalId: readOptionalString(record.externalId) ?? null,
            fileId: readOptionalString(record.fileId) ?? null,
            recognitionJobId: readOptionalString(record.recognitionJobId) ?? null,
            groundTruth: toInputJsonValue(record.groundTruth),
            metadata: toInputJsonValue(record.metadata)
          });
        })
      );
    },
    listRuns(input: ListEvaluationRunsRouteInput) {
      if (input.datasetId) {
        return repositories.evaluationRepository.listRunsByDataset(input.datasetId);
      }

      return Promise.resolve([]);
    },
    createRun(input: CreateEvaluationRunInput) {
      return repositories.evaluationRepository.createRun({
        datasetId: input.datasetId,
        createdById: input.actor.actorUserId,
        providerConfig: {
          providerKey: input.providerKey
        }
      });
    },
    getRun(input: GetEvaluationRunInput) {
      return repositories.evaluationRepository.findRunById({
        id: input.id,
        actorUserId: input.actor.actorUserId
      });
    },
    listRunMetrics(input: ListEvaluationRunMetricsInput) {
      return repositories.evaluationRepository.listMetrics(input.runId);
    }
  };

  return {
    authService: options.authService,
    auditService: options.auditService,
    schemaService: options.schemaService,
    fileService: {
      createUpload(input) {
        const body = input as {
          originalName?: string;
          mimeType?: string;
          byteSize?: number | bigint;
          checksumSha256?: string;
          metadata?: unknown;
          uploadedById?: string;
        };
        const originalName = body.originalName ?? "medical-record-upload";
        const byteSize = typeof body.byteSize === "bigint" ? body.byteSize : BigInt(body.byteSize ?? 0);

        return repositories.fileRepository.create({
          storageKey: toStorageKey(originalName, now()),
          originalName,
          mimeType: body.mimeType ?? "application/octet-stream",
          byteSize,
          checksumSha256: body.checksumSha256 ?? "unknown",
          metadata: toInputJsonValue(body.metadata),
          uploadedById: body.uploadedById ?? null
        });
      }
    },
    jobService: {
      async create(input) {
        const body = input as {
          schemaKey?: string;
          sourceFileId?: string;
          createdById?: string;
          document?: ApiRecognitionDocumentInput;
          options?: unknown;
          providerConfig?: unknown;
        };
        const job = await repositories.jobsRepository.create({
          schemaKey: body.schemaKey ?? "lims-clinical-info",
          sourceFileId: body.sourceFileId ?? null,
          createdById: body.createdById ?? null,
          options: toInputJsonValue(body.options),
          providerConfig: toInputJsonValue(body.providerConfig)
        });
        const result = await options.recognitionOrchestrator.start({
          jobId: job.id,
          document: body.document ?? {
            documentId: body.sourceFileId ?? job.id
          }
        });
        await repositories.resultsRepository.upsertByJobId({
          jobId: job.id,
          fields: toResultFields(result),
          normalizedFields: (result.validation.normalizedCandidates ?? []) as Prisma.InputJsonValue,
          evidence: toResultEvidence(result),
          payload: result as unknown as Prisma.InputJsonValue,
          reviewRequired: shouldReviewResult(result)
        });

        return {
          ...job,
          status: result.status,
          trace: result.trace
        };
      },
      get(id) {
        return repositories.jobsRepository.findById(id);
      }
    },
    resultService: {
      getByJobId(jobId) {
        return repositories.resultsRepository.findByJobId(jobId);
      }
    },
    feedbackService: {
      create(input) {
        return repositories.feedbackRepository.create(input);
      }
    },
    writebackService: {
      async execute(input) {
        const body = input as {
          jobId?: string;
          payload?: unknown;
          idempotencyKey?: string;
        };
        const jobId = body.jobId ?? "unknown-job";
        const attempt = await repositories.writebackRepository.create({
          jobId,
          targetSystem: "lims",
          endpoint: "configured-lims-writeback",
          idempotencyKey: body.idempotencyKey ?? `${jobId}:${now().toISOString()}`,
          requestPayload: toInputJsonValue(body.payload ?? input)
        });

        return repositories.writebackRepository.complete(attempt.id, {
          status: "succeeded",
          responsePayload: {
            accepted: true
          },
          retryable: false,
          completedAt: now()
        });
      }
    },
    providerService,
    evaluationService
  };
}

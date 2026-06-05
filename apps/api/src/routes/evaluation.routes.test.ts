import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createAuthHooks, type AuthContext, type AuthLayerService } from "../middleware/auth.middleware";
import { registerEvaluationRoutes, type EvaluationRouteService } from "./evaluation.routes";

function createServer(authService: AuthLayerService, evaluationService: EvaluationRouteService) {
  const server = Fastify();
  const authHooks = createAuthHooks({ authService });

  return registerEvaluationRoutes(server, {
    evaluationService,
    authHooks
  }).then(() => server);
}

function createAuthorizedContext(): AuthContext {
  return {
    actorUserId: "user-001",
    authType: "jwt",
    permissions: ["evaluation:manage"],
    roles: ["admin"]
  };
}

function createEvaluationService(overrides: Partial<EvaluationRouteService> & Record<string, unknown> = {}) {
  return {
    listDatasets: vi.fn(async () => []),
    createRun: vi.fn(),
    getRun: vi.fn(),
    createDataset: vi.fn(),
    importSamples: vi.fn(),
    listRuns: vi.fn(),
    listRunMetrics: vi.fn(),
    ...overrides
  };
}

describe("evaluation routes", () => {
  it("GET /evaluations/datasets 未认证时返回 401 且不查询数据集", async () => {
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService();
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/datasets"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "UNAUTHORIZED"
    });
    expect(evaluationService.listDatasets).not.toHaveBeenCalled();
  });

  it("POST /evaluations/runs 已认证但缺少 evaluation:manage 权限时返回 403", async () => {
    const context: AuthContext = {
      actorUserId: "user-002",
      authType: "jwt",
      permissions: ["provider:manage"],
      roles: ["operator"]
    };
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn(() => {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      })
    };
    const evaluationService = createEvaluationService();
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "POST",
      url: "/evaluations/runs",
      headers: {
        authorization: "Bearer valid-jwt"
      },
      payload: {
        datasetId: "dataset-001",
        providerKey: "openai"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(authService.requirePermission).toHaveBeenCalledWith(context, "evaluation:manage");
    expect(evaluationService.createRun).not.toHaveBeenCalled();
  });

  it("GET /evaluations/datasets 有权限时返回数据集列表", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      listDatasets: vi.fn(async () => [
        {
          id: "dataset-001",
          name: "入院记录抽取基准集",
          caseCount: 12
        }
      ])
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/datasets",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(authService.requirePermission).toHaveBeenCalledWith(context, "evaluation:manage");
    expect(response.json()).toEqual({
      items: [
        {
          id: "dataset-001",
          name: "入院记录抽取基准集",
          caseCount: 12
        }
      ]
    });
  });

  it("POST /evaluations/runs 有权限时创建评估 run", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      createRun: vi.fn(async () => ({
        id: "run-001",
        datasetId: "dataset-001",
        providerKey: "openai",
        status: "queued"
      }))
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "POST",
      url: "/evaluations/runs",
      headers: {
        authorization: "Bearer valid-jwt"
      },
      payload: {
        datasetId: "dataset-001",
        providerKey: "openai",
        sampleLimit: 5
      }
    });

    expect(response.statusCode).toBe(201);
    expect(evaluationService.createRun).toHaveBeenCalledWith({
      datasetId: "dataset-001",
      providerKey: "openai",
      sampleLimit: 5,
      actor: context
    });
    expect(response.json()).toEqual({
      run: {
        id: "run-001",
        datasetId: "dataset-001",
        providerKey: "openai",
        status: "queued"
      }
    });
  });

  it("GET /evaluations/runs/:id 返回单个 run", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      getRun: vi.fn(async () => ({
        id: "run-001",
        datasetId: "dataset-001",
        providerKey: "openai",
        status: "completed"
      }))
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/runs/run-001",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(evaluationService.getRun).toHaveBeenCalledWith({
      id: "run-001",
      actor: context
    });
    expect(response.json()).toEqual({
      run: {
        id: "run-001",
        datasetId: "dataset-001",
        providerKey: "openai",
        status: "completed"
      }
    });
  });

  it("GET /evaluations/runs/:id 找不到 run 时返回结构化 404", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      getRun: vi.fn(async () => null)
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/runs/run-missing",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "EVALUATION_RUN_NOT_FOUND"
    });
  });

  it("POST /evaluations/datasets 创建已脱敏评估数据集", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      createDataset: vi.fn(async () => ({
        id: "dataset-001",
        key: "lims-ci-v1",
        displayName: "LIMS 合成评估集",
        deidentified: true
      }))
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "POST",
      url: "/evaluations/datasets",
      headers: {
        authorization: "Bearer valid-jwt"
      },
      payload: {
        key: "lims-ci-v1",
        displayName: "LIMS 合成评估集",
        description: "CI synthetic dataset",
        deidentified: true,
        metadata: {
          sourceType: "synthetic"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(evaluationService.createDataset).toHaveBeenCalledWith({
      key: "lims-ci-v1",
      displayName: "LIMS 合成评估集",
      description: "CI synthetic dataset",
      deidentified: true,
      metadata: {
        sourceType: "synthetic"
      },
      actor: context
    });
    expect(response.json()).toEqual({
      dataset: {
        id: "dataset-001",
        key: "lims-ci-v1",
        displayName: "LIMS 合成评估集",
        deidentified: true
      }
    });
  });

  it("POST /evaluations/datasets/:id/samples 导入样本 metadata、ground truth 和 evidence", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      importSamples: vi.fn(async () => [
        {
          id: "sample-001",
          externalId: "synthetic-001"
        }
      ])
    });
    const server = await createServer(authService, evaluationService);

    const payload = {
      samples: [
        {
          externalId: "synthetic-001",
          metadata: {
            sourceType: "synthetic",
            deidentified: true
          },
          groundTruth: [
            {
              fieldKey: "clinicalDiagnosis",
              value: "肺腺癌",
              normalizedValue: "肺腺癌",
              evidence: [
                {
                  text: "临床诊断：肺腺癌",
                  pageNumber: 1,
                  blockId: "block-001"
                }
              ],
              needsReview: false
            }
          ]
        }
      ]
    };

    const response = await server.inject({
      method: "POST",
      url: "/evaluations/datasets/dataset-001/samples",
      headers: {
        authorization: "Bearer valid-jwt"
      },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(evaluationService.importSamples).toHaveBeenCalledWith({
      datasetId: "dataset-001",
      samples: payload.samples,
      actor: context
    });
    expect(response.json()).toEqual({
      samples: [
        {
          id: "sample-001",
          externalId: "synthetic-001"
        }
      ]
    });
  });

  it("GET /evaluations/runs 支持按 dataset 查询评估运行列表", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      listRuns: vi.fn(async () => [
        {
          id: "run-001",
          datasetId: "dataset-001",
          status: "completed"
        }
      ])
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/runs?datasetId=dataset-001",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(evaluationService.listRuns).toHaveBeenCalledWith({
      datasetId: "dataset-001",
      actor: context
    });
    expect(response.json()).toEqual({
      items: [
        {
          id: "run-001",
          datasetId: "dataset-001",
          status: "completed"
        }
      ]
    });
  });

  it("GET /evaluations/runs/:id/metrics 返回已持久化指标", async () => {
    const context = createAuthorizedContext();
    const authService: AuthLayerService = {
      authenticateJwt: vi.fn(async () => context),
      authenticateApiToken: vi.fn(),
      requirePermission: vi.fn()
    };
    const evaluationService = createEvaluationService({
      listRunMetrics: vi.fn(async () => [
        {
          name: "field_accuracy",
          value: 0.91,
          unit: "ratio"
        }
      ])
    });
    const server = await createServer(authService, evaluationService);

    const response = await server.inject({
      method: "GET",
      url: "/evaluations/runs/run-001/metrics",
      headers: {
        authorization: "Bearer valid-jwt"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(evaluationService.listRunMetrics).toHaveBeenCalledWith({
      runId: "run-001",
      actor: context
    });
    expect(response.json()).toEqual({
      metrics: [
        {
          name: "field_accuracy",
          value: 0.91,
          unit: "ratio"
        }
      ]
    });
  });
});

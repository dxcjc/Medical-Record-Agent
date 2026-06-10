import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createApiClient } from "./client";
import type {
  ApiAuditListResponse,
  ApiCollectionResponse,
  ApiEvaluationDataset,
  ApiEvaluationMetricsResponse,
  ApiEvaluationRun,
  ApiEvaluationRunResponse,
  ApiEvaluationSamplesResponse,
  ApiFeedbackResponse,
  ApiFileRecord,
  ApiProviderHealthResponse,
  ApiProviderItem,
  ApiProviderResponse,
  ApiRecognitionJob,
  ApiRecognitionResult,
  ApiSchemaCompareResponse,
  ApiSchemaDraftResponse,
  ApiSchemaValidationResponse,
  ApiSchemaVersionResponse,
  ApiWritebackEligibleItem,
  ApiWritebackResponse
} from "./types";

describe("createApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("对页面使用的 API 方法暴露集中契约类型，避免退回 unknown", () => {
    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    expectTypeOf(client.listSchemas).returns.resolves.toEqualTypeOf<ApiCollectionResponse<ApiSchemaVersionResponse>>();
    expectTypeOf(client.createSchemaDraft).returns.resolves.toEqualTypeOf<ApiSchemaDraftResponse>();
    expectTypeOf(client.updateSchemaDraft).returns.resolves.toEqualTypeOf<ApiSchemaDraftResponse>();
    expectTypeOf(client.validateSchemaDraft).returns.resolves.toEqualTypeOf<ApiSchemaValidationResponse>();
    expectTypeOf(client.publishSchemaDraft).returns.resolves.toEqualTypeOf<ApiSchemaVersionResponse>();
    expectTypeOf(client.deactivateSchemaVersion).returns.resolves.toEqualTypeOf<ApiSchemaVersionResponse>();
    expectTypeOf(client.rollbackSchemaVersion).returns.resolves.toEqualTypeOf<ApiSchemaVersionResponse>();
    expectTypeOf(client.compareSchemaVersions).returns.resolves.toEqualTypeOf<ApiSchemaCompareResponse>();
    expectTypeOf(client.listProviders).returns.resolves.toEqualTypeOf<ApiCollectionResponse<ApiProviderItem>>();
    expectTypeOf(client.setDefaultProvider).returns.resolves.toEqualTypeOf<ApiProviderResponse>();
    expectTypeOf(client.saveProviderConfig).returns.resolves.toEqualTypeOf<ApiProviderResponse>();
    expectTypeOf(client.checkProviderHealth).returns.resolves.toEqualTypeOf<ApiProviderHealthResponse>();
    expectTypeOf(client.listEvaluationDatasets).returns.resolves.toEqualTypeOf<ApiCollectionResponse<ApiEvaluationDataset>>();
    expectTypeOf(client.createEvaluationDataset).returns.resolves.toEqualTypeOf<{ dataset: ApiEvaluationDataset }>();
    expectTypeOf(client.importEvaluationSamples).returns.resolves.toEqualTypeOf<ApiEvaluationSamplesResponse>();
    expectTypeOf(client.listEvaluationRuns).returns.resolves.toEqualTypeOf<ApiCollectionResponse<ApiEvaluationRun>>();
    expectTypeOf(client.createEvaluationRun).returns.resolves.toEqualTypeOf<ApiEvaluationRunResponse>();
    expectTypeOf(client.getEvaluationRun).returns.resolves.toEqualTypeOf<ApiEvaluationRunResponse>();
    expectTypeOf(client.listEvaluationRunMetrics).returns.resolves.toEqualTypeOf<ApiEvaluationMetricsResponse>();
    expectTypeOf(client.createFile).returns.resolves.toEqualTypeOf<ApiFileRecord>();
    expectTypeOf(client.createRecognitionJob).returns.resolves.toEqualTypeOf<ApiRecognitionJob>();
    expectTypeOf(client.getJob).returns.resolves.toEqualTypeOf<ApiRecognitionJob>();
    expectTypeOf(client.getResult).returns.resolves.toEqualTypeOf<ApiRecognitionResult>();
    expectTypeOf(client.createFeedback).returns.resolves.toEqualTypeOf<ApiFeedbackResponse>();
    expectTypeOf(client.executeWriteback).returns.resolves.toEqualTypeOf<ApiWritebackResponse>();
    expectTypeOf(client.listEligibleWritebacks).returns.resolves.toEqualTypeOf<ApiCollectionResponse<ApiWritebackEligibleItem>>();
    expectTypeOf(client.listAudit).returns.resolves.toEqualTypeOf<ApiAuditListResponse>();
  });

  function stubJsonFetch(payload: unknown, calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>) {
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      // 这里记录真实传给 fetch 的参数，避免测试只验证 mock 行为。
      calls.push({ input, init });
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  }

  it("创建文件记录时会携带授权信息和文件元数据", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchMock = stubJsonFetch({ id: "file-demo-001" }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.createFile({
      originalName: "synthetic-record.pdf",
      mimeType: "application/pdf",
      byteSize: 2048,
      checksumSha256: "demo-checksum",
      contentBase64: "REVNT19QREZfQllURVM=",
    });

    expect(result).toEqual({ id: "file-demo-001" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.example.test/files",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          originalName: "synthetic-record.pdf",
          mimeType: "application/pdf",
          byteSize: 2048,
          checksumSha256: "demo-checksum",
          contentBase64: "REVNT19QREZfQllURVM=",
        }),
        headers: expect.any(Headers),
      }),
    );

    const headers = fetchCalls[0]?.init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBe("Bearer token-demo");
    expect((headers as Headers).get("content-type")).toBe("application/json");
    expect(fetchCalls[0]?.init?.credentials).toBe("include");
  });

  it("没有 Bearer token 时仍携带 cookie credentials 以支持 HttpOnly session", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ status: "ok", service: "medical-record-agent-api" }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => null,
    });

    await client.health();

    expect(fetchCalls[0]?.input).toBe("http://api.example.test/health");
    expect(fetchCalls[0]?.init?.credentials).toBe("include");
    expect((fetchCalls[0]?.init?.headers as Headers).get("authorization")).toBeNull();
  });

  it("logout 调用后端 session 失效端点并携带 cookie credentials", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ ok: true }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => null,
    });

    await client.logout();

    expect(fetchCalls[0]?.input).toBe("http://api.example.test/auth/logout");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });

  it("后端返回文件存储未配置时会保留错误码并给出中文提示", async () => {
    const fetchMock: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "FILE_STORAGE_PROVIDER_NOT_CONFIGURED" }), {
        headers: { "content-type": "application/json" },
        status: 503,
      }),
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    await expect(
      client.createFile({
        originalName: "synthetic-record.pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        checksumSha256: "demo-checksum",
        contentBase64: "REVNT19QREZfQllURVM=",
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 503,
      code: "FILE_STORAGE_PROVIDER_NOT_CONFIGURED",
      message: "文件存储服务未配置，无法保存上传的病历文件。"
    });
  });

  it("后端返回文件 checksum 不一致时会给出中文提示", async () => {
    const fetchMock: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "FILE_CHECKSUM_MISMATCH" }), {
        headers: { "content-type": "application/json" },
        status: 409,
      }),
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    await expect(
      client.createFile({
        originalName: "synthetic-record.pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        contentBase64: "REVNT19QREZfQllURVM=",
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 409,
      code: "FILE_CHECKSUM_MISMATCH",
      message: "文件校验值不一致，请重新选择病历文件后再上传。"
    });
  });

  it("读取文件内容时调用文件二进制端点并解析文件名", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response("DEMO_PDF_BYTES", {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=\"record.pdf\"",
        },
        status: 200,
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.getFileContent("file-001");

    expect(result.fileName).toBe("record.pdf");
    expect(result.mimeType).toBe("application/pdf");
    await expect(result.blob.text()).resolves.toBe("DEMO_PDF_BYTES");
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/files/file-001/content");
    expect((fetchCalls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer token-demo");
  });

  it("发布 schema 草稿时调用对应发布端点", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ version: { id: "schema-version-001" } }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.publishSchemaDraft("draft-001", "调整字段证据策略");

    expect(result).toEqual({ version: { id: "schema-version-001" } });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/schemas/drafts/draft-001/publish");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ changelog: "调整字段证据策略" }),
      }),
    );
  });

  it("停用和回滚 schema 版本时调用真实版本变更端点", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ version: { id: "schema-version-001" } }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    await client.deactivateSchemaVersion("schema-version-001");
    await client.rollbackSchemaVersion("schema-version-002");

    expect(fetchCalls[0]?.input).toBe("http://api.example.test/schemas/versions/schema-version-001/deactivate");
    expect(fetchCalls[0]?.init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(fetchCalls[1]?.input).toBe("http://api.example.test/schemas/versions/schema-version-002/rollback");
    expect(fetchCalls[1]?.init).toEqual(expect.objectContaining({ method: "POST" }));
  });

  it("创建评估运行时发送 dataset、provider 和 sampleLimit", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ run: { id: "run-001" } }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.createEvaluationRun({
      datasetId: "dataset-001",
      schemaKey: "custom-clinical-schema",
      providerKey: "mock-provider",
      sampleLimit: 20,
    });

    expect(result).toEqual({ run: { id: "run-001" } });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/evaluations/runs");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          datasetId: "dataset-001",
          schemaKey: "custom-clinical-schema",
          providerKey: "mock-provider",
          sampleLimit: 20,
        }),
      }),
    );
  });

  it("长任务 API 会把 AbortSignal 透传到底层 fetch", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ id: "job-001", run: { id: "run-001" }, samples: [], status: "succeeded" }, fetchCalls);
    const controller = new AbortController();

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    await client.createFile(
      {
        originalName: "synthetic-record.pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        checksumSha256: "demo-checksum",
      },
      { signal: controller.signal }
    );
    await client.createRecognitionJob(
      {
        schemaKey: "custom-clinical-schema",
        sourceFileId: "file-001",
      },
      { signal: controller.signal }
    );
    await client.createEvaluationRun(
      {
        datasetId: "dataset-001",
        providerKey: "mock-model",
      },
      { signal: controller.signal }
    );
    await client.importEvaluationSamples(
      "dataset-001",
      [
        {
          externalId: "synthetic-001",
          groundTruth: {
            chiefComplaint: {
              value: "咳嗽",
            },
          },
        },
      ],
      { signal: controller.signal }
    );
    await client.executeWriteback(
      {
        jobId: "job-001",
        confirmed: true,
      },
      { signal: controller.signal }
    );
    await client.checkProviderHealth("openai-compatible-model", { signal: controller.signal });
    await client.saveProviderConfig(
      "openai-compatible-model",
      {
        kind: "llm",
        displayName: "OpenAI-compatible Model",
        enabled: true,
        isDefault: true,
        config: {}
      },
      { signal: controller.signal }
    );
    await client.validateSchemaDraft("draft-001", { definition: {} }, { signal: controller.signal });
    await client.publishSchemaDraft("draft-001", "发布草稿", { signal: controller.signal });
    await client.deactivateSchemaVersion("schema-version-001", { signal: controller.signal });
    await client.rollbackSchemaVersion("schema-version-002", { signal: controller.signal });
    await client.compareSchemaVersions("custom-clinical-schema", { left: "v1", right: "v2" }, { signal: controller.signal });
    await client.listEligibleWritebacks(10, { signal: controller.signal });

    expect(fetchCalls.map((call) => call.init?.signal)).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
    ]);
  });

  it("导入评估样本时把 samples 包装到后端约定字段", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ samples: [{ id: "sample-001" }] }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const samples = [
      {
        externalId: "synthetic-001",
        input: { text: "主诉：咳嗽" },
        groundTruth: {
          chiefComplaint: {
            value: "咳嗽",
            normalizedValue: "咳嗽"
          }
        },
      },
    ];
    const result = await client.importEvaluationSamples("dataset-001", samples);

    expect(result).toEqual({ samples: [{ id: "sample-001" }] });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/evaluations/datasets/dataset-001/samples");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ samples }),
      }),
    );
  });

  it("按 run 读取评估指标时调用 metrics 端点", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ metrics: [{ name: "field_accuracy", value: 0.91, unit: "ratio" }] }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.listEvaluationRunMetrics("run-001");

    expect(result).toEqual({ metrics: [{ name: "field_accuracy", value: 0.91, unit: "ratio" }] });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/evaluations/runs/run-001/metrics");
  });

  it("执行写回时必须发送 confirmed=true", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ status: "succeeded" }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.executeWriteback({
      jobId: "job-demo-1",
      confirmed: true,
    });

    expect(result).toEqual({ status: "succeeded" });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/writeback");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobId: "job-demo-1",
          confirmed: true,
        }),
      }),
    );
  });

  it("读取可写回候选列表时调用 writeback eligible 端点并携带 limit", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ items: [{ id: "job-eligible-001" }] }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.listEligibleWritebacks(10);

    expect(result).toEqual({ items: [{ id: "job-eligible-001" }] });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/writeback/eligible?limit=10");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("执行 Provider 健康检查时调用单 provider health 端点", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch(
      {
        health: {
          key: "openai-compatible-model",
          status: "healthy",
          latencyMs: 128
        }
      },
      fetchCalls
    );

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.checkProviderHealth("openai-compatible-model");

    expect(result).toEqual({
      health: {
        key: "openai-compatible-model",
        status: "healthy",
        latencyMs: 128
      }
    });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/providers/openai-compatible-model/health");
    expect(fetchCalls[0]?.init).toEqual(expect.objectContaining({ method: "POST" }));
  });

  it("保存 Provider 配置时调用真实 provider 配置端点", async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    stubJsonFetch({ provider: { key: "openai-responses-prod", isDefault: true } }, fetchCalls);

    const client = createApiClient({
      baseUrl: "http://api.example.test",
      getToken: () => "token-demo",
    });

    const result = await client.saveProviderConfig("openai-responses-prod", {
      kind: "llm",
      displayName: "OpenAI Responses 生产模型",
      enabled: true,
      isDefault: true,
      config: {
        model: "gpt-4.1-mini",
        timeoutMs: 45000,
      },
      secretRefs: {
        apiKey: "OPENAI_API_KEY",
      },
    });

    expect(result).toEqual({ provider: { key: "openai-responses-prod", isDefault: true } });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/providers/openai-responses-prod");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          kind: "llm",
          displayName: "OpenAI Responses 生产模型",
          enabled: true,
          isDefault: true,
          config: {
            model: "gpt-4.1-mini",
            timeoutMs: 45000,
          },
          secretRefs: {
            apiKey: "OPENAI_API_KEY",
          },
        }),
      }),
    );
    expect((fetchCalls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer token-demo");
  });
});

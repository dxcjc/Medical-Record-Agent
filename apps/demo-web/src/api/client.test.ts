import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";

describe("createApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
        groundTruth: { chiefComplaint: "咳嗽" },
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
      payload: { chiefComplaint: "咳嗽" },
    });

    expect(result).toEqual({ status: "succeeded" });
    expect(fetchCalls[0]?.input).toBe("http://api.example.test/writeback");
    expect(fetchCalls[0]?.init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          jobId: "job-demo-1",
          confirmed: true,
          payload: { chiefComplaint: "咳嗽" },
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
});

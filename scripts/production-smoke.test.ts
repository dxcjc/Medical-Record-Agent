import { describe, expect, it, vi } from "vitest";

import { buildProductionSmokeConfig, isCliEntrypoint, runProductionSmoke } from "./production-smoke";

describe("production smoke script", () => {
  const defaultSyntheticSmokeConfig = {
    schemaKey: "lims-clinical-info",
    syntheticFileName: "production-smoke-medical-record.txt",
    syntheticMimeType: "text/plain",
    syntheticContentBase64: "REU="
  };

  it("在 Windows 路径下也能正确判断 CLI 入口模块", () => {
    expect(
      isCliEntrypoint(
        "file:///D:/02-Learning/agent/scripts/production-smoke.ts",
        "D:\\02-Learning\\agent\\scripts\\production-smoke.ts"
      )
    ).toBe(true);
  });

  it("从环境变量生成安全 smoke 配置，默认不执行识别和写回", () => {
    expect(
      buildProductionSmokeConfig({
        PRODUCTION_SMOKE_BASE_URL: "http://127.0.0.1:3000",
        PRODUCTION_SMOKE_EMAIL: "admin@example.local",
        PRODUCTION_SMOKE_PASSWORD: "ChangeMe123!"
      })
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      email: "admin@example.local",
      password: "ChangeMe123!",
      expectedServiceMode: "production",
      runRecognition: false,
      runWriteback: false,
      schemaKey: "lims-clinical-info",
      syntheticFileName: "production-smoke-medical-record.txt",
      syntheticMimeType: "text/plain",
      syntheticContentBase64: Buffer.from(
        "病历摘要：患者，男，60岁。临床诊断：肺腺癌。样本类型：组织。",
        "utf8"
      ).toString("base64")
    });
  });

  it("从环境变量读取识别 smoke 的 schema、provider 和脱敏样本配置", () => {
    expect(
      buildProductionSmokeConfig({
        PRODUCTION_SMOKE_BASE_URL: "http://127.0.0.1:3000/",
        PRODUCTION_SMOKE_EMAIL: "admin@example.local",
        PRODUCTION_SMOKE_PASSWORD: "ChangeMe123!",
        PRODUCTION_SMOKE_RUN_RECOGNITION: "1",
        PRODUCTION_SMOKE_SCHEMA_KEY: "custom-clinical-schema",
        PRODUCTION_SMOKE_OCR_PROVIDER_KEY: "http-ocr",
        PRODUCTION_SMOKE_PROVIDER_KEY: "openai-responses",
        PRODUCTION_SMOKE_SYNTHETIC_FILE_NAME: "deidentified-record.pdf",
        PRODUCTION_SMOKE_SYNTHETIC_MIME_TYPE: "application/pdf",
        PRODUCTION_SMOKE_SYNTHETIC_FILE_BASE64: "UERG"
      })
    ).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      email: "admin@example.local",
      password: "ChangeMe123!",
      expectedServiceMode: "production",
      runRecognition: true,
      runWriteback: false,
      schemaKey: "custom-clinical-schema",
      ocrProviderKey: "http-ocr",
      providerKey: "openai-responses",
      syntheticFileName: "deidentified-record.pdf",
      syntheticMimeType: "application/pdf",
      syntheticContentBase64: "UERG"
    });
  });

  it("执行 smoke 时先验证 status、登录、provider 列表和 provider health", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const call: { url: string; init?: RequestInit } = { url: String(url) };
      if (init !== undefined) {
        call.init = init;
      }
      fetchCalls.push(call);
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return new Response(
          JSON.stringify({
            runtime: {
              serviceMode: "production"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (pathname === "/auth/login") {
        return new Response(JSON.stringify({ accessToken: "signed.jwt" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (pathname === "/providers") {
        return new Response(JSON.stringify({ items: [{ key: "mock-model", kind: "llm" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (pathname === "/providers/mock-model/health") {
        return new Response(JSON.stringify({ health: { status: "healthy" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    });

    const report = await runProductionSmoke(
      {
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: false,
        runWriteback: false,
        ...defaultSyntheticSmokeConfig
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps.map((step) => step.name)).toEqual([
      "status",
      "login",
      "providers",
      "provider-health:mock-model"
    ]);
    expect(report.steps.every((step) => step.ok)).toBe(true);
    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/status",
      "/auth/login",
      "/providers",
      "/providers/mock-model/health"
    ]);
    expect((fetchCalls[2]?.init?.headers as Headers).get("authorization")).toBe("Bearer signed.jwt");
  });

  it("显式开启识别时上传合成文件、创建任务、读取任务和结果", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const call: { url: string; init?: RequestInit } = { url: String(url) };
      if (init !== undefined) {
        call.init = init;
      }
      fetchCalls.push(call);
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return jsonResponse({ runtime: { serviceMode: "production" } });
      }

      if (pathname === "/auth/login") {
        return jsonResponse({ accessToken: "signed.jwt" });
      }

      if (pathname === "/providers") {
        return jsonResponse({ items: [] });
      }

      if (pathname === "/files") {
        return jsonResponse({ id: "file-smoke-001" });
      }

      if (pathname === "/jobs") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/jobs/job-smoke-001") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/results/job-smoke-001") {
        return jsonResponse({
          jobId: "job-smoke-001",
          payload: {
            validation: {
              decision: "accepted"
            }
          }
        });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    });

    const report = await runProductionSmoke(
      {
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: true,
        runWriteback: false,
        schemaKey: "custom-clinical-schema",
        ocrProviderKey: "http-ocr",
        providerKey: "openai-responses",
        syntheticFileName: "deidentified-record.pdf",
        syntheticMimeType: "application/pdf",
        syntheticContentBase64: "UERG"
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps.map((step) => step.name)).toEqual([
      "status",
      "login",
      "providers",
      "file-upload",
      "recognition-job",
      "job-read",
      "result-read"
    ]);
    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/status",
      "/auth/login",
      "/providers",
      "/files",
      "/jobs",
      "/jobs/job-smoke-001",
      "/results/job-smoke-001"
    ]);
    const uploadBody = JSON.parse(String(fetchCalls[3]?.init?.body));
    expect(uploadBody).toEqual({
      originalName: "deidentified-record.pdf",
      mimeType: "application/pdf",
      contentBase64: "UERG",
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      metadata: {
        source: "production-smoke",
        synthetic: true
      }
    });
    expect(JSON.parse(String(fetchCalls[4]?.init?.body))).toEqual({
      schemaKey: "custom-clinical-schema",
      sourceFileId: "file-smoke-001",
      providerConfig: {
        ocrProviderKey: "http-ocr",
        providerKey: "openai-responses"
      }
    });
  });

  it("显式开启写回时必须先跑识别，并用识别结果里的 readyFields 调用写回", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const call: { url: string; init?: RequestInit } = { url: String(url) };
      if (init !== undefined) {
        call.init = init;
      }
      fetchCalls.push(call);
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return jsonResponse({ runtime: { serviceMode: "production" } });
      }

      if (pathname === "/auth/login") {
        return jsonResponse({ accessToken: "signed.jwt" });
      }

      if (pathname === "/providers") {
        return jsonResponse({ items: [] });
      }

      if (pathname === "/files") {
        return jsonResponse({ id: "file-smoke-001" });
      }

      if (pathname === "/jobs") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/jobs/job-smoke-001") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/results/job-smoke-001") {
        return jsonResponse({
          jobId: "job-smoke-001",
          payload: {
            writeback: {
              readyFields: [
                {
                  fieldKey: "clinicalDiagnosis",
                  targetPath: "clinicalInfo.clinicalDiagnosis",
                  value: "肺腺癌"
                }
              ]
            }
          }
        });
      }

      if (pathname === "/writeback") {
        return jsonResponse({ id: "writeback-smoke-001", status: "succeeded" });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    });

    const report = await runProductionSmoke(
      {
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: true,
        runWriteback: true,
        schemaKey: "lims-clinical-info",
        syntheticFileName: "production-smoke-medical-record.txt",
        syntheticMimeType: "text/plain",
        syntheticContentBase64: "REU="
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps.map((step) => step.name)).toEqual([
      "status",
      "login",
      "providers",
      "file-upload",
      "recognition-job",
      "job-read",
      "result-read",
      "writeback"
    ]);
    const writebackBody = JSON.parse(String(fetchCalls.at(-1)?.init?.body));
    expect(writebackBody).toEqual({
      jobId: "job-smoke-001",
      confirmed: true,
      fields: [
        {
          fieldKey: "clinicalDiagnosis",
          targetPath: "clinicalInfo.clinicalDiagnosis",
          value: "肺腺癌"
        }
      ],
      idempotencyKey: "production-smoke:job-smoke-001"
    });
  });

  it("写回 smoke 找不到 readyFields 时失败，避免无证据写回", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return jsonResponse({ runtime: { serviceMode: "production" } });
      }

      if (pathname === "/auth/login") {
        return jsonResponse({ accessToken: "signed.jwt" });
      }

      if (pathname === "/providers") {
        return jsonResponse({ items: [] });
      }

      if (pathname === "/files") {
        return jsonResponse({ id: "file-smoke-001" });
      }

      if (pathname === "/jobs") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/jobs/job-smoke-001") {
        return jsonResponse({ id: "job-smoke-001", status: "completed" });
      }

      if (pathname === "/results/job-smoke-001") {
        return jsonResponse({
          jobId: "job-smoke-001",
          payload: {
            writeback: {
              readyFields: []
            }
          }
        });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    });

    await expect(
      runProductionSmoke(
        {
          baseUrl: "http://127.0.0.1:3000",
          email: "admin@example.local",
          password: "ChangeMe123!",
          expectedServiceMode: "production",
          runRecognition: true,
          runWriteback: true,
          schemaKey: "lims-clinical-info",
          syntheticFileName: "production-smoke-medical-record.txt",
          syntheticMimeType: "text/plain",
          syntheticContentBase64: "REU="
        },
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow("writeback smoke 未在识别结果中发现 payload.writeback.readyFields");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://127.0.0.1:3000/writeback",
      expect.anything()
    );
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

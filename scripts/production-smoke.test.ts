import { describe, expect, it, vi } from "vitest";

import {
  ProductionSmokeConfigurationBlockedError,
  buildProductionSmokeBlockedReport,
  buildProductionSmokeConfig,
  buildProductionSmokeMachineSummary,
  classifyProductionSmokeReport,
  formatProductionSmokeCliOutput,
  isCliEntrypoint,
  runMockProductionContractSmoke,
  runProductionSmoke,
  runProductionSmokeSafely
} from "./production-smoke";

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
      mode: "real-sandbox",
      baseUrl: "http://127.0.0.1:3000",
      email: "admin@example.local",
      password: "ChangeMe123!",
      expectedServiceMode: "production",
      runRecognition: false,
      runWriteback: false,
      jobPollIntervalMs: 1000,
      jobPollTimeoutMs: 120000,
      schemaKey: "lims-clinical-info",
      syntheticFileName: "production-smoke-medical-record.txt",
      syntheticMimeType: "text/plain",
      syntheticContentBase64: Buffer.from(
        "病历摘要：患者，男，60岁。临床诊断：肺腺癌。样本类型：组织。",
        "utf8"
      ).toString("base64")
    });
  });

  it("缺少 production smoke 环境变量时返回 blocked 报告而不是伪造通过", () => {
    expect(buildProductionSmokeBlockedReport({})).toEqual({
      mode: "blocked",
      steps: [
        {
          name: "configuration",
          ok: false,
          status: "blocked",
          code: "PRODUCTION_SMOKE_CONFIGURATION_MISSING",
          missingKeys: ["PRODUCTION_SMOKE_BASE_URL", "PRODUCTION_SMOKE_EMAIL", "PRODUCTION_SMOKE_PASSWORD"],
          nextAction:
            "配置 PRODUCTION_SMOKE_MODE=real-sandbox、真实 sandbox base URL 与账号后重跑 corepack pnpm smoke:production。",
          requiredChecks: [
            "real-external-api-login",
            "real-provider-sandbox-connectivity-smoke",
            "real-ocr-llm-lims-sandbox-smoke",
            "writeback-readyFields-only-smoke"
          ],
          detail:
            "external sandbox blocked: 缺少 PRODUCTION_SMOKE_BASE_URL, PRODUCTION_SMOKE_EMAIL, PRODUCTION_SMOKE_PASSWORD；配置 PRODUCTION_SMOKE_MODE=real-sandbox 与真实 sandbox 后才会执行真实外部 API/OCR/LLM/LIMS smoke。"
        },
        {
          name: "secret-resolver",
          ok: false,
          status: "blocked",
          code: "SECRET_RESOLVER_ENV_ONLY",
          provider: "env",
          requiredExternal: ["KMS", "Vault", "Secret Manager"],
          nextAction:
            "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
          requiredChecks: [
            "external-secret-resolution-smoke",
            "provider-health-secretRefs-smoke",
            "provider-response-secret-redaction-smoke",
            "provider-health-secret-redaction-smoke",
            "audit-metadata-secret-redaction-smoke"
          ],
          detail:
            "secret resolver blocked: SECRET_RESOLVER_ENV_ONLY；当前 env resolver 不能代表生产 KMS/Vault/Secret Manager。设置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK 后才可解除。"
        },
        {
          name: "session-invalidation-store",
          ok: false,
          status: "blocked",
          code: "SESSION_INVALIDATION_STORE_IN_MEMORY",
          adapter: "in-memory",
          nextAction:
            "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
          requiredChecks: [
            "two-instance-session-invalidation-smoke",
            "token-hash-ttl-verification",
            "raw-token-not-persisted-check",
            "login-rotation-cross-instance-smoke"
          ],
          detail:
            "session invalidation store blocked: SESSION_INVALIDATION_STORE_IN_MEMORY；当前进程内失效集合不能代表生产多实例 session invalidation store。设置 SESSION_INVALIDATION_STORE_MODE=repository 并接入数据库/Redis 与多实例 smoke 后才可解除。"
        },
        {
          name: "queue-broker",
          ok: false,
          status: "blocked",
          code: "QUEUE_BROKER_NOT_CONFIGURED",
          adapter: "not-configured",
          nextAction:
            "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
          requiredChecks: [
            "multi-worker-lease-smoke",
            "retry-dead-letter-smoke",
            "heartbeat-status-consistency-smoke",
            "status-result-consistency-smoke",
            "idempotency-key-deduplication-smoke"
          ],
          detail:
            "queue broker blocked: QUEUE_BROKER_NOT_CONFIGURED；设置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS、worker 绑定、lease/retry/dead-letter/heartbeat/status-result consistency、idempotency 和多实例 smoke 后才可解除。"
        }
      ]
    });
    expect(() => buildProductionSmokeConfig({})).toThrow(ProductionSmokeConfigurationBlockedError);
  });

  it("blocked production smoke 输出机器可读 JSON 摘要，区分配置、密钥、session store 和队列 broker", () => {
    const report = buildProductionSmokeBlockedReport({})!;
    const summary = buildProductionSmokeMachineSummary(report);
    const output = formatProductionSmokeCliOutput(report);
    const summaryLine = output.split("\n").find((line) => line.startsWith("SUMMARY_JSON "));

    expect(summary.status).toBe("blocked");
    expect(summary.blockedSteps).toEqual([
      {
        name: "configuration",
        code: "PRODUCTION_SMOKE_CONFIGURATION_MISSING",
        missingKeys: ["PRODUCTION_SMOKE_BASE_URL", "PRODUCTION_SMOKE_EMAIL", "PRODUCTION_SMOKE_PASSWORD"],
        nextAction:
          "配置 PRODUCTION_SMOKE_MODE=real-sandbox、真实 sandbox base URL 与账号后重跑 corepack pnpm smoke:production。",
        requiredChecks: [
          "real-external-api-login",
          "real-provider-sandbox-connectivity-smoke",
          "real-ocr-llm-lims-sandbox-smoke",
          "writeback-readyFields-only-smoke"
        ]
      },
      {
        name: "secret-resolver",
        code: "SECRET_RESOLVER_ENV_ONLY",
        provider: "env",
        requiredExternal: ["KMS", "Vault", "Secret Manager"],
        nextAction:
          "配置 SECRET_RESOLVER_PROVIDER=vault|kms|secret-manager 并接入真实 client/SDK，再重跑 provider health 与 production smoke。",
        requiredChecks: [
          "external-secret-resolution-smoke",
          "provider-health-secretRefs-smoke",
          "provider-response-secret-redaction-smoke",
          "provider-health-secret-redaction-smoke",
          "audit-metadata-secret-redaction-smoke"
        ]
      },
      {
        name: "session-invalidation-store",
        code: "SESSION_INVALIDATION_STORE_IN_MEMORY",
        adapter: "in-memory",
        nextAction:
          "配置 SESSION_INVALIDATION_STORE_MODE=repository 与数据库/Redis adapter，并运行至少两个 API 实例的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      },
      {
        name: "queue-broker",
        code: "QUEUE_BROKER_NOT_CONFIGURED",
        adapter: "not-configured",
        nextAction:
          "配置 QUEUE_MODE=broker、真实 Redis/RabbitMQ/SQS 与 worker，再运行多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke。",
        requiredChecks: [
          "multi-worker-lease-smoke",
          "retry-dead-letter-smoke",
          "heartbeat-status-consistency-smoke",
          "status-result-consistency-smoke",
          "idempotency-key-deduplication-smoke"
        ]
      }
    ]);
    expect(summaryLine).toBeDefined();
    expect(JSON.parse(summaryLine!.replace("SUMMARY_JSON ", ""))).toEqual(summary);
    expect(output).toContain("NEXT queue-broker 配置 QUEUE_MODE=broker");
  });

  it("production smoke 汇总状态明确区分 passed、blocked、failed", () => {
    expect(classifyProductionSmokeReport({ mode: "mock-production", steps: [{ name: "status", ok: true }] })).toBe(
      "passed"
    );
    expect(
      classifyProductionSmokeReport({
        mode: "real-sandbox",
        steps: [{ name: "provider-health:http-ocr", ok: false, status: "blocked" }]
      })
    ).toBe("blocked");
    expect(classifyProductionSmokeReport({ mode: "failed", steps: [{ name: "status", ok: false }] })).toBe("failed");
  });

  it("mock production 模式不需要真实外部环境变量，并明确生成 contract smoke 配置", () => {
    expect(
      buildProductionSmokeConfig({
        PRODUCTION_SMOKE_MODE: "mock-production"
      })
    ).toEqual({
      mode: "mock-production",
      baseUrl: "http://mock-production.local",
      email: "mock-production@example.local",
      password: "MockProduction123!",
      expectedServiceMode: "production",
      runRecognition: true,
      runWriteback: false,
      jobPollIntervalMs: 0,
      jobPollTimeoutMs: 1000,
      schemaKey: "lims-clinical-info",
      syntheticFileName: "production-smoke-medical-record.txt",
      syntheticMimeType: "text/plain",
      syntheticContentBase64: Buffer.from(
        "病历摘要：患者，男，60岁。临床诊断：肺腺癌。样本类型：组织。",
        "utf8"
      ).toString("base64")
    });
    expect(buildProductionSmokeBlockedReport({ PRODUCTION_SMOKE_MODE: "mock-production" })).toBeNull();
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
      mode: "real-sandbox",
      baseUrl: "http://127.0.0.1:3000",
      email: "admin@example.local",
      password: "ChangeMe123!",
      expectedServiceMode: "production",
      runRecognition: true,
      runWriteback: false,
      jobPollIntervalMs: 1000,
      jobPollTimeoutMs: 120000,
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
        return new Response(JSON.stringify({ items: [{ key: "fixture-model", kind: "llm" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (pathname === "/providers/fixture-model/health") {
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
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: false,
        runWriteback: false,
        jobPollIntervalMs: 1000,
        jobPollTimeoutMs: 120000,
        ...defaultSyntheticSmokeConfig
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps.map((step) => step.name)).toEqual([
      "status",
      "login",
      "providers",
      "provider-health:fixture-model"
    ]);
    expect(report.steps.every((step) => step.ok)).toBe(true);
    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/status",
      "/auth/login",
      "/providers",
      "/providers/fixture-model/health"
    ]);
    expect((fetchCalls[2]?.init?.headers as Headers).get("authorization")).toBe("Bearer signed.jwt");
  });

  it("provider health 返回 blocked 时 smoke 明确分类为 blocked 而不是 failed", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return jsonResponse({ runtime: { serviceMode: "production" } });
      }

      if (pathname === "/auth/login") {
        return jsonResponse({ accessToken: "signed.jwt" });
      }

      if (pathname === "/providers") {
        return jsonResponse({ items: [{ key: "saved-http-ocr", kind: "ocr" }] });
      }

      if (pathname === "/providers/saved-http-ocr/health") {
        return jsonResponse({
          health: {
            key: "saved-http-ocr",
            status: "blocked",
            blockedReason: "SECRET_NOT_FOUND",
            secretDiagnostics: {
              apiKey: {
                secretRef: "OCR_VENDOR_TOKEN",
                source: "env",
                resolved: false,
                blockedReason: "SECRET_NOT_FOUND"
              }
            }
          }
        });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    });

    const report = await runProductionSmoke(
      {
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: false,
        runWriteback: false,
        jobPollIntervalMs: 1000,
        jobPollTimeoutMs: 120000,
        ...defaultSyntheticSmokeConfig
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps).toContainEqual(
      expect.objectContaining({
        name: "provider-health:saved-http-ocr",
        ok: false,
        status: "blocked",
        code: "SECRET_NOT_FOUND",
        provider: "saved-http-ocr",
        detail: "SECRET_NOT_FOUND"
      })
    );
  });

  it("status 暴露 secret resolver 或 queue 非生产时真实 smoke 标记 blocked", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const pathname = new URL(String(url)).pathname;

      if (pathname === "/status") {
        return jsonResponse({
          runtime: {
            serviceMode: "production",
            secretResolver: {
              provider: "env",
              productionReady: false,
              blockedReason: "SECRET_RESOLVER_ENV_ONLY",
              requiredExternal: ["KMS", "Vault", "Secret Manager"],
              config: {}
            },
            sessionInvalidationStore: {
              adapter: "in-memory",
              productionReady: false,
              blockedReason: "SESSION_INVALIDATION_STORE_IN_MEMORY",
              capabilities: {
                centralized: false,
                durable: false,
                multiInstance: false,
                tokenHashing: true,
                ttl: true
              },
              policy: {
                invalidationTtlMs: 86400000
              }
            },
            queue: {
              adapter: "in-process",
              productionReady: false,
              blockedReason: "QUEUE_BROKER_NOT_CONFIGURED",
              capabilities: {
                durable: false,
                multiInstance: false,
                lease: true,
                retry: true,
                deadLetter: true,
                heartbeat: true
              },
              policy: {
                maxAttempts: 1,
                heartbeatIntervalMs: 30000
              }
            }
          }
        });
      }

      if (pathname === "/auth/login") {
        return jsonResponse({ accessToken: "signed.jwt" });
      }

      if (pathname === "/providers") {
        return jsonResponse({ items: [] });
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    });

    const report = await runProductionSmoke(
      {
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: false,
        runWriteback: false,
        jobPollIntervalMs: 1000,
        jobPollTimeoutMs: 120000,
        ...defaultSyntheticSmokeConfig
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.steps).toContainEqual(
      expect.objectContaining({
        name: "secret-resolver",
        ok: false,
        status: "blocked",
        code: "SECRET_RESOLVER_ENV_ONLY",
        provider: "env",
        requiredExternal: ["KMS", "Vault", "Secret Manager"],
        detail:
          "SECRET_RESOLVER_ENV_ONLY provider=env requiredExternal=KMS/Vault/Secret Manager；真实 KMS/Vault/Secret Manager 未验证。"
      })
    );
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        name: "session-invalidation-store",
        ok: false,
        status: "blocked",
        code: "SESSION_INVALIDATION_STORE_IN_MEMORY",
        adapter: "in-memory",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ],
        detail:
          "SESSION_INVALIDATION_STORE_IN_MEMORY adapter=in-memory；生产多实例 session invalidation store 未验证。"
      })
    );
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        name: "queue-broker",
        ok: false,
        status: "blocked",
        code: "QUEUE_BROKER_NOT_CONFIGURED",
        adapter: "in-process",
        detail:
          "QUEUE_BROKER_NOT_CONFIGURED adapter=in-process；真实 broker 多实例 lease/retry/dead-letter/heartbeat/status-result consistency/idempotency smoke 未验证。"
      })
    );
    expect(classifyProductionSmokeReport(report)).toBe("blocked");
  });

  it("真实 smoke 运行异常时返回 failed 报告而不是 blocked", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "DOWN" }, 503));

    await expect(
      runProductionSmokeSafely(
        {
          mode: "real-sandbox",
          baseUrl: "http://127.0.0.1:3000",
          email: "admin@example.local",
          password: "ChangeMe123!",
          expectedServiceMode: "production",
          runRecognition: false,
          runWriteback: false,
          jobPollIntervalMs: 1000,
          jobPollTimeoutMs: 120000,
          ...defaultSyntheticSmokeConfig
        },
        fetchMock as unknown as typeof fetch
      )
    ).resolves.toEqual({
      mode: "failed",
      steps: [
        {
          name: "production-smoke",
          ok: false,
          status: "failed",
          detail: "status 返回 HTTP 503"
        }
      ]
    });
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
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: true,
        runWriteback: false,
        jobPollIntervalMs: 1000,
        jobPollTimeoutMs: 120000,
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

  it("异步任务 smoke 会轮询到 terminal 状态后再读取结果", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const jobStatuses = ["queued", "running", "completed"];
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
        return jsonResponse({ id: "job-smoke-001", status: "queued", executionMode: "asynchronous" });
      }

      if (pathname === "/jobs/job-smoke-001") {
        return jsonResponse({ id: "job-smoke-001", status: jobStatuses.shift() ?? "completed" });
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
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: true,
        runWriteback: false,
        jobPollIntervalMs: 0,
        jobPollTimeoutMs: 1000,
        ...defaultSyntheticSmokeConfig
      },
      fetchMock as unknown as typeof fetch
    );

    expect(report.mode).toBe("real-sandbox");
    expect(report.steps.filter((step) => step.name === "job-read").at(-1)).toEqual(
      expect.objectContaining({
        ok: true,
        detail: "status=completed"
      })
    );
    expect(fetchCalls.map((call) => new URL(call.url).pathname)).toEqual([
      "/status",
      "/auth/login",
      "/providers",
      "/files",
      "/jobs",
      "/jobs/job-smoke-001",
      "/jobs/job-smoke-001",
      "/jobs/job-smoke-001",
      "/results/job-smoke-001"
    ]);
  });

  it("mock production contract smoke 可在本地完整跑通并标注 mock-production 模式", async () => {
    const report = await runMockProductionContractSmoke(
      buildProductionSmokeConfig({
        PRODUCTION_SMOKE_MODE: "mock-production",
        PRODUCTION_SMOKE_RUN_WRITEBACK: "1"
      })
    );

    expect(report.mode).toBe("mock-production");
    expect(report.steps.map((step) => step.name)).toEqual([
      "status",
      "login",
      "providers",
      "provider-health:fixture-ocr",
      "provider-health:fixture-model",
      "file-upload",
      "recognition-job",
      "job-read",
      "job-read",
      "result-read",
      "writeback"
    ]);
    expect(report.steps.every((step) => step.ok)).toBe(true);
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
        mode: "real-sandbox",
        baseUrl: "http://127.0.0.1:3000",
        email: "admin@example.local",
        password: "ChangeMe123!",
        expectedServiceMode: "production",
        runRecognition: true,
        runWriteback: true,
        jobPollIntervalMs: 1000,
        jobPollTimeoutMs: 120000,
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
          mode: "real-sandbox",
          baseUrl: "http://127.0.0.1:3000",
          email: "admin@example.local",
          password: "ChangeMe123!",
          expectedServiceMode: "production",
          runRecognition: true,
          runWriteback: true,
          jobPollIntervalMs: 1000,
          jobPollTimeoutMs: 120000,
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

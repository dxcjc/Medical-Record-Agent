import { describe, expect, it, vi } from "vitest";

import { createApiServer, type ApiServerServices } from "./server";

async function waitForAuditRecord(record: unknown, expectedCalls: number) {
  const mock = record as { mock: { calls: unknown[] } };

  for (let index = 0; index < 10; index += 1) {
    if (mock.mock.calls.length >= expectedCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createAuthService(
  permissions: string[] = [
    "schema:read",
    "job:create",
    "job:read",
    "feedback:create",
    "writeback:execute",
    "provider:manage",
    "evaluation:manage"
  ]
) {
  const context = {
    actorUserId: "user-001",
    authType: "jwt" as const,
    permissions,
    roles: ["operator"]
  };

  return {
    login: vi.fn(async () => ({
      accessToken: "signed.jwt",
      tokenType: "Bearer",
      user: {
        id: "user-001",
        email: "demo@example.local",
        displayName: "演示用户"
      },
      permissions,
      roles: ["operator"]
    })),
    authenticateJwt: vi.fn(async () => context),
    authenticateApiToken: vi.fn(async () => context),
    isSessionTokenInvalidated: vi.fn((_token: string) => false),
    invalidateSessionToken: vi.fn(async (_token: string) => undefined),
    describeSessionInvalidationStore: vi.fn<() => unknown>(() => undefined),
    requirePermission: vi.fn((authContext: typeof context | null, permission: string) => {
      if (!authContext) {
        throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
      }

      if (!authContext.permissions.includes(permission)) {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      }
    })
  };
}

function createSchemaRouteService() {
  // Server 级测试只关心路由是否装配完整，schema 行为细节由独立 service/route 测试覆盖。
  return {
    listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info", version: 1 }]),
    createDraft: vi.fn(async (input) => ({ id: "draft-001", ...input })),
    updateDraft: vi.fn(async (input) => ({ id: input.id, definition: input.definition })),
    validateDraft: vi.fn(async () => ({ valid: true, errors: [] })),
    publishDraft: vi.fn(async (input) => ({ id: "version-001", draftId: input.id })),
    deactivateVersion: vi.fn(async (input) => ({ id: input.id, status: "inactive" })),
    rollbackVersion: vi.fn(async (input) => ({ id: input.id, status: "active" })),
    compareVersions: vi.fn(async (input) => ({
      schemaKey: input.schemaKey,
      changedVersion: {
        left: 1,
        right: 2
      },
      fields: {
        added: [],
        removed: [],
        unchanged: []
      }
    }))
  };
}

function createServices(authService = createAuthService()): ApiServerServices {
  return {
    authService,
    auditService: {
      listRecent: vi.fn(async () => [{ id: "audit-001", action: "auth.login", result: "success" }]),
      record: vi.fn(async () => undefined)
    },
    schemaService: createSchemaRouteService(),
    fileService: {
      createUpload: vi.fn(async () => ({ id: "file-001", storageKey: "uploads/file-001.pdf" })),
      getContent: vi.fn(async () => ({
        id: "file-001",
        originalName: "record.pdf",
        mimeType: "application/pdf",
        body: Buffer.from("DEMO_PDF_BYTES")
      }))
    },
    jobService: {
      create: vi.fn(async () => ({ id: "job-001", status: "queued" })),
      get: vi.fn(async () => ({ id: "job-001", status: "completed" }))
    },
    resultService: {
      getByJobId: vi.fn(async () => ({ jobId: "job-001", fields: [] }))
    },
    feedbackService: {
      create: vi.fn(async () => ({ id: "feedback-001", status: "open" }))
    },
    writebackService: {
      execute: vi.fn(async () => ({ id: "writeback-001", status: "succeeded" })),
      listEligible: vi.fn(async () => [])
    },
    providerService: {
      listProviders: vi.fn(async () => [
        {
          key: "mock",
          name: "Mock Provider",
          isDefault: true,
          secretRefs: {
            apiKey: "secret-value"
          }
        }
      ]),
      setDefaultProvider: vi.fn(async () => ({ key: "mock", isDefault: true })),
      checkProviderHealth: vi.fn(async () => ({
        key: "mock",
        status: "healthy",
        checkedAt: "2026-06-08T10:00:00.000Z",
        message: "provider reachable"
      }))
    },
    evaluationService: {
      listDatasets: vi.fn(async () => [{ id: "dataset-001", name: "入院记录抽取基准集" }]),
      createDataset: vi.fn(async () => ({ id: "dataset-001", deidentified: true })),
      importSamples: vi.fn(async () => [{ id: "sample-001", externalId: "synthetic-001" }]),
      listRuns: vi.fn(async () => [{ id: "run-001", datasetId: "dataset-001", status: "queued" }]),
      createRun: vi.fn(async () => ({ id: "run-001", status: "queued" })),
      getRun: vi.fn(async () => ({ id: "run-001", status: "queued" })),
      listRunMetrics: vi.fn(async () => [{ name: "field_accuracy", value: 0.91, unit: "ratio" }])
    }
  };
}

describe("api server routes", () => {
  it("所有响应带安全基线响应头，生产前端可启用 CSP、frame 和 nosniff 防护", async () => {
    const server = await createApiServer({ services: createServices() });

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-xss-protection"]).toBe("1; mode=block");
  });

  it("登录接口按客户端来源限流，避免本地 demo 暴露后被暴力试探", async () => {
    const server = await createApiServer({
      services: createServices(),
      rateLimit: {
        login: {
          max: 2,
          windowMs: 60_000
        }
      }
    });

    for (let index = 0; index < 2; index += 1) {
      const allowed = await server.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: "203.0.113.10",
        payload: {
          email: "demo@example.local",
          password: "ChangeMe123!"
        }
      });
      expect(allowed.statusCode).toBe(200);
    }

    const limited = await server.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "203.0.113.10",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "RATE_LIMITED" });
    expect(limited.headers["retry-after"]).toBe("60");
  });

  it("未显式传入配置时也启用登录限流安全基线", async () => {
    const server = await createApiServer({ services: createServices() });

    for (let index = 0; index < 20; index += 1) {
      const allowed = await server.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: "203.0.113.11",
        payload: {
          email: "demo@example.local",
          password: "ChangeMe123!"
        }
      });
      expect(allowed.statusCode).toBe(200);
    }

    const limited = await server.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "203.0.113.11",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("高风险写回接口按 actor 和来源限流，且不会影响不同来源", async () => {
    const services = createServices();
    const server = await createApiServer({
      services,
      rateLimit: {
        writeback: {
          max: 1,
          windowMs: 60_000
        }
      }
    });

    const payload = {
      jobId: "job-001",
      confirmed: true
    };
    const first = await server.inject({
      method: "POST",
      url: "/writeback",
      remoteAddress: "203.0.113.20",
      headers: { authorization: "Bearer signed.jwt" },
      payload
    });
    expect(first.statusCode).toBe(200);

    const limited = await server.inject({
      method: "POST",
      url: "/writeback",
      remoteAddress: "203.0.113.20",
      headers: { authorization: "Bearer signed.jwt" },
      payload
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "RATE_LIMITED" });

    const otherSource = await server.inject({
      method: "POST",
      url: "/writeback",
      remoteAddress: "203.0.113.21",
      headers: { authorization: "Bearer signed.jwt" },
      payload
    });
    expect(otherSource.statusCode).toBe(200);
  });

  it("支持从登录到任务、结果、反馈、写回、Provider 和评估的主流程", async () => {
    const services = createServices();
    const server = await createApiServer({ services });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });
    expect(login.statusCode).toBe(200);

    const authHeader = { authorization: "Bearer signed.jwt" };

    const schemas = await server.inject({ method: "GET", url: "/schemas", headers: authHeader });
    expect(schemas.statusCode).toBe(200);

    const file = await server.inject({
      method: "POST",
      url: "/files",
      headers: authHeader,
      payload: {
        originalName: "record.pdf",
        mimeType: "application/pdf",
        byteSize: 1234,
        checksumSha256: "sha-demo"
      }
    });
    expect(file.statusCode).toBe(200);

    const job = await server.inject({
      method: "POST",
      url: "/jobs",
      headers: authHeader,
      payload: {
        schemaKey: "lims-clinical-info",
        sourceFileId: "file-001"
      }
    });
    expect(job.statusCode).toBe(200);

    const result = await server.inject({ method: "GET", url: "/results/job-001", headers: authHeader });
    expect(result.statusCode).toBe(200);

    const feedback = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: authHeader,
      payload: {
        jobId: "job-001",
        fieldKey: "clinicalDiagnosis",
        correctedValue: "DEMO_DIAGNOSIS_A"
      }
    });
    expect(feedback.statusCode).toBe(200);

    const writeback = await server.inject({
      method: "POST",
      url: "/writeback",
      headers: authHeader,
      payload: {
        jobId: "job-001",
        confirmed: true
      }
    });
    expect(writeback.statusCode).toBe(200);
    expect(services.writebackService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001",
        confirmed: true,
        actor: expect.objectContaining({
          actorUserId: "user-001"
        })
      })
    );

    const providers = await server.inject({ method: "GET", url: "/providers", headers: authHeader });
    expect(providers.statusCode).toBe(200);
    expect(providers.body).not.toContain("secret-value");

    const providerHealth = await server.inject({ method: "POST", url: "/providers/mock/health", headers: authHeader });
    expect(providerHealth.statusCode).toBe(200);
    expect(providerHealth.json()).toEqual({
      health: expect.objectContaining({
        key: "mock",
        status: "healthy"
      })
    });

    const evaluationDatasets = await server.inject({
      method: "GET",
      url: "/evaluations/datasets",
      headers: authHeader
    });
    expect(evaluationDatasets.statusCode).toBe(200);

    const evaluationRun = await server.inject({
      method: "POST",
      url: "/evaluations/runs",
      headers: authHeader,
      payload: {
        datasetId: "dataset-001",
        providerKey: "mock"
      }
    });
    expect(evaluationRun.statusCode).toBe(201);

    const audit = await server.inject({ method: "GET", url: "/audit", headers: authHeader });
    expect(audit.statusCode).toBe(403);

    await waitForAuditRecord(services.auditService.record, 4);
    expect(services.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.upload",
        objectType: "file",
        result: "success"
      })
    );
    expect(services.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "result.view",
        objectType: "job",
        objectId: "job-001",
        result: "success"
      })
    );
    expect(services.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.create",
        objectType: "feedback",
        result: "success"
      })
    );
    expect(services.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "writeback.execute",
        objectType: "job",
        objectId: "job-001",
        result: "success"
      })
    );
  });

  it("浏览器会话可通过 HttpOnly cookie 访问受保护路由，登出后同一 cookie 立即失效", async () => {
    const invalidatedTokens = new Set<string>();
    const authService = createAuthService(["job:read"]);
    authService.login.mockResolvedValue({
      accessToken: "cookie-session.jwt",
      tokenType: "Bearer",
      user: {
        id: "user-001",
        email: "demo@example.local",
        displayName: "演示用户"
      },
      permissions: ["job:read"],
      roles: ["operator"]
    });
    authService.isSessionTokenInvalidated.mockImplementation((token: string) => invalidatedTokens.has(token));
    authService.invalidateSessionToken.mockImplementation(async (token: string) => {
      invalidatedTokens.add(token);
    });
    const server = await createApiServer({ services: createServices(authService) });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@example.local",
        password: "ChangeMe123!"
      }
    });
    const cookieHeader = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    expect(cookieHeader).toBe("mra_session=cookie-session.jwt");

    const cookieAccess = await server.inject({
      method: "GET",
      url: "/jobs/job-001",
      headers: {
        cookie: cookieHeader
      }
    });
    expect(cookieAccess.statusCode).toBe(200);
    expect(authService.authenticateJwt).toHaveBeenCalledWith("cookie-session.jwt");

    const logout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: cookieHeader
      }
    });
    expect(logout.statusCode).toBe(200);
    expect(authService.invalidateSessionToken).toHaveBeenCalledWith("cookie-session.jwt");

    const afterLogout = await server.inject({
      method: "GET",
      url: "/jobs/job-001",
      headers: {
        cookie: cookieHeader
      }
    });
    expect(afterLogout.statusCode).toBe(401);
    expect(afterLogout.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("受保护路由没有认证时返回结构化 401", async () => {
    const server = await createApiServer({ services: createServices() });

    const response = await server.inject({ method: "GET", url: "/jobs/job-001" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("允许 demo-web 开发服务器跨域调用 API", async () => {
    const server = await createApiServer({ services: createServices() });

    const response = await server.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("状态端点返回当前服务模式和生产驱动摘要且不泄露 secret", async () => {
    const server = await createApiServer({
      services: createServices(),
      runtimeInfo: {
        serviceMode: "production",
        providers: {
          ocr: "http",
          llm: "openai-responses",
          storage: "s3",
          writeback: "lims"
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "medical-record-agent-api",
      runtime: {
        serviceMode: "production",
        providers: {
          ocr: "http",
          llm: "openai-responses",
          storage: "s3",
          writeback: "lims"
        }
      }
    });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("apiKey");
  });

  it("状态端点在队列实现可描述时返回脱敏 queue contract", async () => {
    const services = createServices();
    services.jobQueue = {
      async drain() {
        return undefined;
      },
      describe: () => ({
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
      })
    };
    const server = await createApiServer({
      services,
      runtimeInfo: {
        serviceMode: "production",
        providers: {
          ocr: "mock",
          llm: "mock",
          storage: "local",
          writeback: "lims"
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
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
        })
      })
    );
    expect(response.body).not.toContain("redis://");
    expect(response.body).not.toContain("token");
  });

  it("状态端点可返回脱敏 secret resolver contract 供 production smoke 判定 blocked", async () => {
    const server = await createApiServer({
      services: createServices(),
      runtimeInfo: {
        serviceMode: "production",
        providers: {
          ocr: "http",
          llm: "openai-responses",
          storage: "s3",
          writeback: "lims"
        },
        secretResolver: {
          provider: "vault",
          productionReady: false,
          blockedReason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED",
          requiredExternal: ["KMS", "Vault", "Secret Manager"],
          config: {
            vaultAddress: "https://vault.example.local"
          }
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
          secretResolver: {
            provider: "vault",
            productionReady: false,
            blockedReason: "SECRET_RESOLVER_EXTERNAL_PROVIDER_NOT_CONNECTED",
            requiredExternal: ["KMS", "Vault", "Secret Manager"],
            config: {
              vaultAddress: "https://vault.example.local"
            }
          }
        })
      })
    );
    expect(response.body).not.toContain("VAULT_TOKEN");
    expect(response.body).not.toContain("replace-with-vault-token");
  });

  it("状态端点可返回脱敏 session invalidation store contract 供多实例部署 gate 判定 blocked", async () => {
    const authService = createAuthService();
    authService.describeSessionInvalidationStore.mockReturnValue({
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
    });
    const server = await createApiServer({
      services: createServices(authService),
      runtimeInfo: {
        serviceMode: "production",
        providers: {
          ocr: "http",
          llm: "openai-responses",
          storage: "s3",
          writeback: "lims"
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        runtime: expect.objectContaining({
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
          }
        })
      })
    );
    expect(response.body).not.toContain("mra_session=");
    expect(response.body).not.toContain("raw.jwt");
  });

  it("写回路由要求已确认任务和 writeback 权限", async () => {
    const authService = createAuthService(["job:read"]);
    const services = createServices(authService);
    const server = await createApiServer({ services });

    const missingPermission = await server.inject({
      method: "POST",
      url: "/writeback",
      headers: { authorization: "Bearer signed.jwt" },
      payload: {
        jobId: "job-001",
        confirmed: true
      }
    });
    expect(missingPermission.statusCode).toBe(403);

    const withPermission = await createApiServer({ services: createServices(createAuthService(["writeback:execute"])) });
    const unconfirmed = await withPermission.inject({
      method: "POST",
      url: "/writeback",
      headers: { authorization: "Bearer signed.jwt" },
      payload: {
        jobId: "job-001",
        confirmed: false
      }
    });
    expect(unconfirmed.statusCode).toBe(409);
    expect(unconfirmed.json()).toEqual({
      error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
    });
  });

  it("写回路由必须校验服务端任务状态已确认", async () => {
    const services = createServices(createAuthService(["writeback:execute"]));
    services.jobService.get = vi.fn(async () => ({ id: "job-001", status: "queued" }));
    const server = await createApiServer({ services });

    const response = await server.inject({
      method: "POST",
      url: "/writeback",
      headers: { authorization: "Bearer signed.jwt" },
      payload: {
        jobId: "job-001",
        confirmed: true
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "WRITEBACK_REQUIRES_CONFIRMED_JOB"
    });
    expect(services.jobService.get).toHaveBeenCalledWith("job-001");
    expect(services.writebackService.execute).not.toHaveBeenCalled();
  });

  it("服务层异常返回结构化错误且不泄露底层 secret 或原始 provider 错误", async () => {
    const services = createServices();
    services.fileService.createUpload = vi.fn(async () => {
      throw new Error("raw provider failure with apiKey=real-secret-value");
    });
    const server = await createApiServer({ services });

    const response = await server.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer signed.jwt" },
      payload: {
        originalName: "record.pdf"
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "INTERNAL_ERROR"
    });
    expect(response.body).not.toContain("real-secret-value");
    expect(response.body).not.toContain("raw provider failure");
  });

  it("上传和结果路由分别强制检查 job:create 与 job:read 权限", async () => {
    const uploadServer = await createApiServer({
      services: createServices(createAuthService(["schema:read"]))
    });
    const uploadDenied = await uploadServer.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer signed.jwt" },
      payload: {
        originalName: "record.pdf"
      }
    });
    expect(uploadDenied.statusCode).toBe(403);

    const resultServer = await createApiServer({
      services: createServices(createAuthService(["job:create"]))
    });
    const resultDenied = await resultServer.inject({
      method: "GET",
      url: "/results/job-001",
      headers: { authorization: "Bearer signed.jwt" }
    });
    expect(resultDenied.statusCode).toBe(403);
  });
});

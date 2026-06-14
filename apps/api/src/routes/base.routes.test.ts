import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { createAuthHooks, type AuthContext, type AuthLayerService } from "../middleware/auth.middleware";
import { createAuditHooks } from "../middleware/audit.middleware";
import { registerFeedbackRoutes, type FeedbackRouteService } from "./feedback.routes";
import { registerFileRoutes, type FileRouteService } from "./files.routes";
import { registerJobRoutes, type JobRouteService } from "./jobs.routes";
import { registerResultRoutes, type ResultRouteService } from "./results.routes";
import { registerSchemaRoutes, type SchemaRouteService } from "./schemas.routes";
import { registerWritebackRoutes, type WritebackRouteService } from "./writeback.routes";

function createAuthContext(permissions: string[]): AuthContext {
  return {
    actorUserId: "user-001",
    authType: "jwt",
    permissions,
    roles: ["operator"]
  };
}

function createAuthService(context: AuthContext): AuthLayerService {
  return {
    authenticateJwt: vi.fn(async () => context),
    authenticateApiToken: vi.fn(async () => context),
    requirePermission: vi.fn((authContext, permission) => {
      if (!authContext) {
        throw Object.assign(new Error("UNAUTHORIZED"), { code: "UNAUTHORIZED" });
      }

      if (!authContext.permissions.includes(permission)) {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      }
    })
  };
}

function createRouteTools(permissions: string[]) {
  const authService = createAuthService(createAuthContext(permissions));
  const authHooks = createAuthHooks({ authService });
  const recordAudit = vi.fn(async () => undefined);
  const auditHooks = createAuditHooks({ recordAudit });

  return {
    authService,
    authHooks,
    auditHooks,
    recordAudit
  };
}

function createSchemaRouteService(): SchemaRouteService {
  // 这里只验证基础路由权限和响应包装，Schema Studio 的具体行为在 schemas.routes.test.ts 覆盖。
  return {
    listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info" }]),
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

async function waitForAuditRecord(record: { mock: { calls: unknown[] } }) {
  for (let index = 0; index < 10; index += 1) {
    if (record.mock.calls.length > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("base route groups", () => {
  it("Schema API 有 schema:read 权限时返回已激活 schema 列表", async () => {
    const server = Fastify();
    const tools = createRouteTools(["schema:read"]);
    const schemaService = createSchemaRouteService();
    await registerSchemaRoutes(server, {
      schemaService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "GET",
      url: "/schemas",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [{ schemaKey: "lims-clinical-info" }]
    });
    expect(schemaService.listActive).toHaveBeenCalledOnce();
  });

  it("File API 上传时要求 job:create 并写入审计", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const fileService: FileRouteService = {
      createUpload: vi.fn(async () => ({ id: "file-001" })),
      getContent: vi.fn()
    };
    await registerFileRoutes(server, {
      fileService,
      authHooks: tools.authHooks,
      auditHooks: tools.auditHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        originalName: "record.pdf"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(fileService.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: "record.pdf"
      })
    );

    await waitForAuditRecord(tools.recordAudit);
    expect(tools.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.upload",
        objectType: "file",
        result: "success"
      })
    );
  });

  it("File API 上传只把共享 DTO 允许字段交给 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const fileService: FileRouteService = {
      createUpload: vi.fn(async () => ({ id: "file-001" })),
      getContent: vi.fn()
    };
    await registerFileRoutes(server, {
      fileService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        originalName: "record.pdf",
        mimeType: "application/pdf",
        byteSize: 12,
        checksumSha256: "a".repeat(64),
        contentBase64: "REU=",
        metadata: {
          source: "unit-test"
        },
        uploadedById: "client-spoof",
        storageKey: "/tmp/should-not-pass"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(fileService.createUpload).toHaveBeenCalledWith({
      originalName: "record.pdf",
      mimeType: "application/pdf",
      byteSize: 12,
      checksumSha256: "a".repeat(64),
      contentBase64: "REU=",
      metadata: {
        source: "unit-test"
      }
    });
  });

  it("File API 上传非法 DTO 时返回 400 且不调用 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const fileService: FileRouteService = {
      createUpload: vi.fn(),
      getContent: vi.fn()
    };
    await registerFileRoutes(server, {
      fileService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        originalName: "",
        checksumSha256: 123
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid file upload payload"
    });
    expect(fileService.createUpload).not.toHaveBeenCalled();
  });

  it("File API 上传拒绝非对象 service 响应", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const fileService = {
      createUpload: vi.fn(async () => "not-object"),
      getContent: vi.fn()
    } as unknown as FileRouteService;
    await registerFileRoutes(server, {
      fileService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/files",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        originalName: "record.pdf"
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "FILE_UPLOAD_RESPONSE_INVALID",
        message: "FILE_UPLOAD_RESPONSE_INVALID",
        statusCode: 500
      })
    );
  });

  it("File API 下载内容时要求 job:read 并写入审计", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:read"]);
    const fileService: FileRouteService = {
      createUpload: vi.fn(),
      getContent: vi.fn(async () => ({
        id: "file-001",
        originalName: "record.pdf",
        mimeType: "application/pdf",
        body: Buffer.from("DEMO_PDF_BYTES")
      }))
    };
    await registerFileRoutes(server, {
      fileService,
      authHooks: tools.authHooks,
      auditHooks: tools.auditHooks
    });

    const response = await server.inject({
      method: "GET",
      url: "/files/file-001/content",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("record.pdf");
    expect(response.rawPayload).toEqual(Buffer.from("DEMO_PDF_BYTES"));
    expect(fileService.getContent).toHaveBeenCalledWith("file-001");

    await waitForAuditRecord(tools.recordAudit);
    expect(tools.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "file.download",
        objectType: "file",
        objectId: "file-001",
        result: "success"
      })
    );
  });

  it("Job API 创建任务和查询任务分别调用 job service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create", "job:read"]);
    const jobService: JobRouteService = {
      create: vi.fn(async () => ({ id: "job-001", status: "queued" })),
      get: vi.fn(async () => ({ id: "job-001", status: "completed" })),
      list: vi.fn(async () => []),
      softDelete: vi.fn(async () => ({ id: "job-001", status: "deleted" })),
      rerun: vi.fn(async () => ({ id: "job-001", status: "queued" }))
    };
    await registerJobRoutes(server, {
      jobService,
      authHooks: tools.authHooks
    });

    const created = await server.inject({
      method: "POST",
      url: "/jobs",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        schemaKey: "lims-clinical-info"
      }
    });
    expect(created.statusCode).toBe(200);
    expect(jobService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "lims-clinical-info"
      })
    );

    const found = await server.inject({
      method: "GET",
      url: "/jobs/job-001",
      headers: { authorization: "Bearer valid-jwt" }
    });
    expect(found.statusCode).toBe(200);
    expect(jobService.get).toHaveBeenCalledWith("job-001");
  });

  it("Job API 创建任务只把共享 DTO 允许字段交给 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const jobService: JobRouteService = {
      create: vi.fn(async () => ({ id: "job-001", status: "queued" })),
      get: vi.fn(),
      list: vi.fn(async () => []),
      softDelete: vi.fn(async () => ({ id: "job-001", status: "deleted" })),
      rerun: vi.fn(async () => ({ id: "job-001", status: "queued" }))
    };
    await registerJobRoutes(server, {
      jobService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/jobs",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        schemaKey: "lims-clinical-info",
        schemaVersionId: "schema-version-001",
        sourceFileId: "file-001",
        document: {
          documentId: "file-001",
          fileName: "record.pdf",
          mimeType: "application/pdf",
          storageKey: "controlled/file-001",
          extra: "drop-me"
        },
        providerConfig: {
          ocrProviderKey: "http-ocr",
          providerKey: "openai-responses",
          apiKey: "drop-me"
        },
        createdById: "client-spoof"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(jobService.create).toHaveBeenCalledWith({
      schemaKey: "lims-clinical-info",
      schemaVersionId: "schema-version-001",
      sourceFileId: "file-001",
      document: {
        documentId: "file-001",
        fileName: "record.pdf",
        mimeType: "application/pdf",
        storageKey: "controlled/file-001"
      },
      providerConfig: {
        ocrProviderKey: "http-ocr",
        providerKey: "openai-responses"
      }
    });
  });

  it("Job API 创建任务非法 DTO 时返回 400 且不调用 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const jobService: JobRouteService = {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(async () => []),
      softDelete: vi.fn(async () => ({ id: "job-001", status: "deleted" })),
      rerun: vi.fn(async () => ({ id: "job-001", status: "queued" }))
    };
    await registerJobRoutes(server, {
      jobService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/jobs",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        schemaKey: "",
        sourceFileId: 42
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid recognition job payload"
    });
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it("Job API 创建任务拒绝非对象 service 响应", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create"]);
    const jobService = {
      create: vi.fn(async () => "not-object"),
      get: vi.fn()
    } as unknown as JobRouteService;
    await registerJobRoutes(server, {
      jobService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/jobs",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        schemaKey: "lims-clinical-info"
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "JOB_CREATE_RESPONSE_INVALID",
        message: "JOB_CREATE_RESPONSE_INVALID",
        statusCode: 500
      })
    );
  });

  it("Job API 查询任务拒绝非对象 service 响应", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:read"]);
    const jobService = {
      create: vi.fn(),
      get: vi.fn(async () => "not-object")
    } as unknown as JobRouteService;
    await registerJobRoutes(server, {
      jobService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "GET",
      url: "/jobs/job-001",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "JOB_RESPONSE_INVALID",
        message: "JOB_RESPONSE_INVALID",
        statusCode: 500
      })
    );
  });

  it("Result API 找不到结果时返回结构化 404", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:read"]);
    const resultService: ResultRouteService = {
      getByJobId: vi.fn(async () => null)
    };
    await registerResultRoutes(server, {
      resultService,
      authHooks: tools.authHooks,
      auditHooks: tools.auditHooks
    });

    const response = await server.inject({
      method: "GET",
      url: "/results/job-missing",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "NOT_FOUND"
    });
  });

  it("Result API 拒绝非对象 service 响应", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:read"]);
    const resultService = {
      getByJobId: vi.fn(async () => "not-object")
    } as unknown as ResultRouteService;
    await registerResultRoutes(server, {
      resultService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "GET",
      url: "/results/job-001",
      headers: { authorization: "Bearer valid-jwt" }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "RESULT_RESPONSE_INVALID",
        message: "RESULT_RESPONSE_INVALID",
        statusCode: 500
      })
    );
  });

  it("Feedback API 创建反馈时要求 feedback:create 并写入审计", async () => {
    const server = Fastify();
    const tools = createRouteTools(["feedback:create"]);
    const feedbackService: FeedbackRouteService = {
      create: vi.fn(async () => ({ id: "feedback-001" })),
      listByJobId: vi.fn(async () => []),
      listAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
      getFieldStats: vi.fn(async () => [])
    };
    await registerFeedbackRoutes(server, {
      feedbackService,
      authHooks: tools.authHooks,
      auditHooks: tools.auditHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        jobId: "job-001",
        fieldKey: "clinicalDiagnosis"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(feedbackService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-001"
      })
    );

    await waitForAuditRecord(tools.recordAudit);
    expect(tools.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.create",
        objectType: "feedback",
        result: "success"
      })
    );
  });

  it("Feedback API 创建反馈只把共享 DTO 允许字段交给 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["feedback:create"]);
    const feedbackService: FeedbackRouteService = {
      create: vi.fn(async () => ({ id: "feedback-001" })),
      listByJobId: vi.fn(async () => []),
      listAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
      getFieldStats: vi.fn(async () => [])
    };
    await registerFeedbackRoutes(server, {
      feedbackService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        jobId: "job-001",
        fieldKey: "clinicalDiagnosis",
        correctedValue: "肺腺癌",
        decision: "accepted",
        reason: "人工复核确认",
        reviewer: "reviewer-001",
        evidenceId: "ev-001",
        evidenceQuote: "临床诊断：肺腺癌",
        status: "golden",
        schemaVersionId: "schema-version-001",
        createdById: "client-spoof"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(feedbackService.create).toHaveBeenCalledWith({
      jobId: "job-001",
      fieldKey: "clinicalDiagnosis",
      correctedValue: "肺腺癌",
      decision: "accepted",
      reason: "人工复核确认",
      reviewer: "reviewer-001",
      evidenceId: "ev-001",
      evidenceQuote: "临床诊断：肺腺癌",
      status: "golden",
      schemaVersionId: "schema-version-001"
    });
  });

  it("Feedback API 创建反馈非法 DTO 时返回 400 且不调用 service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["feedback:create"]);
    const feedbackService: FeedbackRouteService = {
      create: vi.fn(),
      listByJobId: vi.fn(async () => []),
      listAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
      getFieldStats: vi.fn(async () => [])
    };
    await registerFeedbackRoutes(server, {
      feedbackService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        jobId: "",
        fieldKey: 123
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BAD_REQUEST",
      message: "Invalid feedback payload"
    });
    expect(feedbackService.create).not.toHaveBeenCalled();
  });

  it("Feedback API 创建反馈拒绝非对象 service 响应", async () => {
    const server = Fastify();
    const tools = createRouteTools(["feedback:create"]);
    const feedbackService = {
      create: vi.fn(async () => "not-object")
    } as unknown as FeedbackRouteService;
    await registerFeedbackRoutes(server, {
      feedbackService,
      authHooks: tools.authHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/feedback",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        jobId: "job-001",
        fieldKey: "clinicalDiagnosis"
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "FEEDBACK_RESPONSE_INVALID",
        message: "FEEDBACK_RESPONSE_INVALID",
        statusCode: 500
      })
    );
  });

  it("Writeback API 要求请求确认和服务端已完成任务", async () => {
    const server = Fastify();
    const tools = createRouteTools(["writeback:execute"]);
    const writebackService: WritebackRouteService = {
      execute: vi.fn(async () => ({ id: "writeback-001", status: "succeeded" })),
      listEligible: vi.fn(async () => []),
      listHistory: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 }))
    };
    const jobService = {
      get: vi.fn(async () => ({ id: "job-001", status: "completed" }))
    };
    await registerWritebackRoutes(server, {
      writebackService,
      jobService,
      authHooks: tools.authHooks,
      auditHooks: tools.auditHooks
    });

    const response = await server.inject({
      method: "POST",
      url: "/writeback",
      headers: { authorization: "Bearer valid-jwt" },
      payload: {
        jobId: "job-001",
        confirmed: true,
        fields: [
          {
            fieldKey: "clinicalDiagnosis",
            targetPath: "clinicalInfo.clinicalDiagnosis",
            value: "肺腺癌"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(jobService.get).toHaveBeenCalledWith("job-001");
    expect(writebackService.execute).toHaveBeenCalledWith({
      jobId: "job-001",
      confirmed: true,
      actor: expect.objectContaining({
        actorUserId: "user-001"
      })
    });
  });
});

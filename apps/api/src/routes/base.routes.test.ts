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
      createUpload: vi.fn(async () => ({ id: "file-001" }))
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

  it("Job API 创建任务和查询任务分别调用 job service", async () => {
    const server = Fastify();
    const tools = createRouteTools(["job:create", "job:read"]);
    const jobService: JobRouteService = {
      create: vi.fn(async () => ({ id: "job-001", status: "queued" })),
      get: vi.fn(async () => ({ id: "job-001", status: "completed" }))
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

  it("Feedback API 创建反馈时要求 feedback:create 并写入审计", async () => {
    const server = Fastify();
    const tools = createRouteTools(["feedback:create"]);
    const feedbackService: FeedbackRouteService = {
      create: vi.fn(async () => ({ id: "feedback-001" }))
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

  it("Writeback API 要求请求确认和服务端已完成任务", async () => {
    const server = Fastify();
    const tools = createRouteTools(["writeback:execute"]);
    const writebackService: WritebackRouteService = {
      execute: vi.fn(async () => ({ id: "writeback-001", status: "succeeded" }))
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
        confirmed: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(jobService.get).toHaveBeenCalledWith("job-001");
    expect(writebackService.execute).toHaveBeenCalledWith({
      jobId: "job-001",
      confirmed: true
    });
  });
});

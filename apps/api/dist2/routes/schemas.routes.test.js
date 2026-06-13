import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuthHooks } from "../middleware/auth.middleware";
import { registerSchemaRoutes } from "./schemas.routes";
function createContext(permissions) {
    return {
        actorUserId: "user-001",
        authType: "jwt",
        permissions,
        roles: ["schema-admin"]
    };
}
async function createServer(schemaService, permissions) {
    const context = createContext(permissions);
    const authService = {
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
    const server = Fastify();
    await registerSchemaRoutes(server, {
        schemaService,
        authHooks: createAuthHooks({ authService })
    });
    return {
        server,
        context
    };
}
function createSchemaService() {
    return {
        listActive: vi.fn(async () => [{ schemaKey: "lims-clinical-info" }]),
        createDraft: vi.fn(async () => ({ id: "draft-001" })),
        updateDraft: vi.fn(async () => ({ id: "draft-001", status: "draft" })),
        validateDraft: vi.fn(async () => ({ valid: true, errors: [] })),
        publishDraft: vi.fn(async () => ({ id: "version-002", status: "active" })),
        deactivateVersion: vi.fn(async () => ({ id: "version-002", status: "inactive" })),
        rollbackVersion: vi.fn(async () => ({ id: "version-001", status: "active" })),
        compareVersions: vi.fn(async () => ({ changedVersion: { left: 1, right: 2 } }))
    };
}
describe("schema routes", () => {
    it("创建、更新、校验草稿时要求 schema:draft 权限并传入 actor", async () => {
        const schemaService = createSchemaService();
        const { server, context } = await createServer(schemaService, ["schema:read", "schema:draft"]);
        const createDraft = await server.inject({
            method: "POST",
            url: "/schemas/drafts",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                schemaKey: "lims-clinical-info",
                displayName: "LIMS 临床信息",
                definition: {
                    key: "lims-clinical-info"
                }
            }
        });
        const updateDraft = await server.inject({
            method: "PUT",
            url: "/schemas/drafts/draft-001",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                definition: {
                    key: "lims-clinical-info"
                }
            }
        });
        const validateDraft = await server.inject({
            method: "POST",
            url: "/schemas/drafts/draft-001/validate",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                definition: {
                    key: "lims-clinical-info"
                }
            }
        });
        expect(createDraft.statusCode).toBe(201);
        expect(updateDraft.statusCode).toBe(200);
        expect(validateDraft.statusCode).toBe(200);
        expect(schemaService.createDraft).toHaveBeenCalledWith(expect.objectContaining({
            schemaKey: "lims-clinical-info",
            actor: context
        }));
        expect(schemaService.updateDraft).toHaveBeenCalledWith(expect.objectContaining({
            id: "draft-001",
            actor: context
        }));
        expect(schemaService.validateDraft).toHaveBeenCalledWith(expect.objectContaining({
            id: "draft-001",
            actor: context
        }));
    });
    it("发布、停用和回滚版本时要求 schema:publish 权限", async () => {
        const schemaService = createSchemaService();
        const { server, context } = await createServer(schemaService, ["schema:publish"]);
        const publish = await server.inject({
            method: "POST",
            url: "/schemas/drafts/draft-001/publish",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                changelog: "新增字段"
            }
        });
        const deactivate = await server.inject({
            method: "POST",
            url: "/schemas/versions/version-002/deactivate",
            headers: { authorization: "Bearer valid-jwt" }
        });
        const rollback = await server.inject({
            method: "POST",
            url: "/schemas/versions/version-001/rollback",
            headers: { authorization: "Bearer valid-jwt" }
        });
        expect(publish.statusCode).toBe(201);
        expect(deactivate.statusCode).toBe(200);
        expect(rollback.statusCode).toBe(200);
        expect(schemaService.publishDraft).toHaveBeenCalledWith({
            id: "draft-001",
            changelog: "新增字段",
            actor: context
        });
        expect(schemaService.deactivateVersion).toHaveBeenCalledWith({
            id: "version-002",
            actor: context
        });
        expect(schemaService.rollbackVersion).toHaveBeenCalledWith({
            id: "version-001",
            actor: context
        });
    });
    it("比较版本走 schema:draft 权限并返回结构化结果", async () => {
        const schemaService = createSchemaService();
        const { server } = await createServer(schemaService, ["schema:draft"]);
        const response = await server.inject({
            method: "GET",
            url: "/schemas/lims-clinical-info/compare?left=version-001&right=version-002",
            headers: { authorization: "Bearer valid-jwt" }
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            comparison: {
                changedVersion: {
                    left: 1,
                    right: 2
                }
            }
        });
    });
    it("缺少 schema:publish 权限时拒绝发布", async () => {
        const schemaService = createSchemaService();
        const { server } = await createServer(schemaService, ["schema:draft"]);
        const response = await server.inject({
            method: "POST",
            url: "/schemas/drafts/draft-001/publish",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                changelog: "权限不足"
            }
        });
        expect(response.statusCode).toBe(403);
        expect(schemaService.publishDraft).not.toHaveBeenCalled();
    });
    it("创建草稿只把 schema DTO 允许字段交给 service，剥离客户端伪造 actor/status 字段", async () => {
        const schemaService = createSchemaService();
        const { server, context } = await createServer(schemaService, ["schema:draft"]);
        const response = await server.inject({
            method: "POST",
            url: "/schemas/drafts",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                schemaKey: "lims-clinical-info",
                displayName: "LIMS 临床信息",
                definition: {
                    key: "lims-clinical-info"
                },
                actor: {
                    actorUserId: "client-spoof"
                },
                status: "published",
                createdById: "client-spoof"
            }
        });
        expect(response.statusCode).toBe(201);
        expect(schemaService.createDraft).toHaveBeenCalledWith({
            schemaKey: "lims-clinical-info",
            displayName: "LIMS 临床信息",
            definition: {
                key: "lims-clinical-info"
            },
            actor: context
        });
    });
    it("schema 草稿非法 DTO 返回 400 且不调用 service", async () => {
        const schemaService = createSchemaService();
        const { server } = await createServer(schemaService, ["schema:draft"]);
        const response = await server.inject({
            method: "POST",
            url: "/schemas/drafts",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                schemaKey: "",
                displayName: "",
                definition: "not-object"
            }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: "BAD_REQUEST",
            message: "Invalid schema draft payload"
        });
        expect(schemaService.createDraft).not.toHaveBeenCalled();
    });
    it("schema 路由拒绝 service 返回 scalar 被包装成成功响应", async () => {
        const schemaService = createSchemaService();
        vi.mocked(schemaService.listActive).mockResolvedValueOnce(["not-object"]);
        vi.mocked(schemaService.publishDraft).mockResolvedValueOnce("not-object");
        const { server } = await createServer(schemaService, ["schema:read", "schema:publish"]);
        const listResponse = await server.inject({
            method: "GET",
            url: "/schemas",
            headers: { authorization: "Bearer valid-jwt" }
        });
        const publishResponse = await server.inject({
            method: "POST",
            url: "/schemas/drafts/draft-001/publish",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                changelog: "release"
            }
        });
        expect(listResponse.statusCode).toBe(500);
        expect(publishResponse.statusCode).toBe(500);
    });
});
//# sourceMappingURL=schemas.routes.test.js.map
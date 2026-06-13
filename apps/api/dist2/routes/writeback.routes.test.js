import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuthHooks } from "../middleware/auth.middleware";
import { registerWritebackRoutes } from "./writeback.routes";
function createAuthContext(permissions) {
    return {
        actorUserId: "user-001",
        authType: "jwt",
        permissions,
        roles: ["operator"]
    };
}
function createAuthService(context) {
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
async function createServer(input) {
    const server = Fastify();
    const authHooks = createAuthHooks({ authService: input.authService });
    await registerWritebackRoutes(server, {
        writebackService: input.writebackService,
        jobService: {
            get: vi.fn(async () => ({ id: "job-001", status: "completed" }))
        },
        authHooks
    });
    return server;
}
describe("writeback routes", () => {
    it("GET /writeback/eligible 未认证时返回 401 且不查询候选列表", async () => {
        const authService = {
            authenticateJwt: vi.fn(),
            authenticateApiToken: vi.fn(),
            requirePermission: vi.fn()
        };
        const writebackService = {
            execute: vi.fn(),
            listEligible: vi.fn(async () => [])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "GET",
            url: "/writeback/eligible?limit=20"
        });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
        expect(writebackService.listEligible).not.toHaveBeenCalled();
    });
    it("GET /writeback/eligible 已认证但缺少 writeback:execute 权限时返回 403", async () => {
        const context = createAuthContext(["job:read"]);
        const authService = createAuthService(context);
        const writebackService = {
            execute: vi.fn(),
            listEligible: vi.fn(async () => [])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "GET",
            url: "/writeback/eligible?limit=20",
            headers: { authorization: "Bearer valid-jwt" }
        });
        expect(response.statusCode).toBe(403);
        expect(authService.requirePermission).toHaveBeenCalledWith(context, "writeback:execute");
        expect(writebackService.listEligible).not.toHaveBeenCalled();
    });
    it("GET /writeback/eligible 有权限时透传 actor 和 limit，并返回 items 包装", async () => {
        const context = createAuthContext(["writeback:execute"]);
        const authService = createAuthService(context);
        const writebackService = {
            execute: vi.fn(),
            listEligible: vi.fn(async () => [
                {
                    id: "job-eligible-001",
                    jobId: "job-eligible-001",
                    readyFields: [{ fieldKey: "clinicalDiagnosis", value: "肺腺癌" }]
                }
            ])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "GET",
            url: "/writeback/eligible?limit=5",
            headers: { authorization: "Bearer valid-jwt" }
        });
        expect(response.statusCode).toBe(200);
        expect(writebackService.listEligible).toHaveBeenCalledWith({
            actor: context,
            limit: 5
        });
        expect(response.json()).toEqual({
            items: [
                {
                    id: "job-eligible-001",
                    jobId: "job-eligible-001",
                    readyFields: [{ fieldKey: "clinicalDiagnosis", value: "肺腺癌" }]
                }
            ]
        });
    });
    it("POST /writeback 丢弃客户端 fields/payload，只把确认 DTO 和 actor 交给服务层", async () => {
        const context = createAuthContext(["writeback:execute"]);
        const authService = createAuthService(context);
        const writebackService = {
            execute: vi.fn(async () => ({ status: "success" })),
            listEligible: vi.fn(async () => [])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "POST",
            url: "/writeback",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                jobId: "job-001",
                confirmed: true,
                idempotencyKey: "job-001:manual",
                fields: [
                    {
                        fieldKey: "clinicalDiagnosis",
                        targetPath: "clinicalInfo.clinicalDiagnosis",
                        value: "客户端篡改值"
                    }
                ],
                payload: {
                    clinicalInfo: {
                        clinicalDiagnosis: "客户端篡改 payload"
                    }
                }
            }
        });
        expect(response.statusCode).toBe(200);
        expect(writebackService.execute).toHaveBeenCalledWith({
            jobId: "job-001",
            confirmed: true,
            idempotencyKey: "job-001:manual",
            actor: context
        });
    });
    it("POST /writeback 拒绝非法 idempotencyKey，避免宽松输入进入写回服务", async () => {
        const context = createAuthContext(["writeback:execute"]);
        const authService = createAuthService(context);
        const writebackService = {
            execute: vi.fn(async () => ({ status: "success" })),
            listEligible: vi.fn(async () => [])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "POST",
            url: "/writeback",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                jobId: "job-001",
                confirmed: true,
                idempotencyKey: {
                    nested: "not-allowed"
                }
            }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
            error: "BAD_REQUEST",
            message: "Invalid writeback payload"
        });
        expect(writebackService.execute).not.toHaveBeenCalled();
    });
    it("POST /writeback 服务层返回非对象响应时返回 500，不包装成业务成功", async () => {
        const context = createAuthContext(["writeback:execute"]);
        const authService = createAuthService(context);
        const writebackService = {
            execute: vi.fn(async () => "not-object"),
            listEligible: vi.fn(async () => [])
        };
        const server = await createServer({ authService, writebackService });
        const response = await server.inject({
            method: "POST",
            url: "/writeback",
            headers: { authorization: "Bearer valid-jwt" },
            payload: {
                jobId: "job-001",
                confirmed: true
            }
        });
        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual(expect.objectContaining({
            code: "WRITEBACK_RESPONSE_INVALID",
            message: "WRITEBACK_RESPONSE_INVALID",
            statusCode: 500
        }));
    });
});
//# sourceMappingURL=writeback.routes.test.js.map
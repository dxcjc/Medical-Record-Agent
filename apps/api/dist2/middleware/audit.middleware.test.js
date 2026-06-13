import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createAuditHooks } from "./audit.middleware";
describe("audit middleware", () => {
    it("成功请求后记录 actor、action、object 和 success，且不记录密码或 token 明文", async () => {
        const recordAudit = vi.fn(async () => undefined);
        const server = Fastify();
        const auditHooks = createAuditHooks({ recordAudit });
        const auth = {
            actorUserId: "user-001",
            actorApiTokenId: "token-001",
            authType: "api-token",
            permissions: ["job:read"],
            roles: ["operator"]
        };
        server.addHook("preHandler", async (request) => {
            request.auth = auth;
        });
        server.post("/login-like", {
            preHandler: [auditHooks.audit({ action: "auth.login", objectType: "auth", objectId: "login" })]
        }, async () => ({ ok: true }));
        const response = await server.inject({
            method: "POST",
            url: "/login-like",
            headers: {
                authorization: "Bearer should-not-be-stored",
                "x-api-token": "api-token-plaintext"
            },
            payload: {
                email: "demo@example.local",
                password: "ChangeMe123!",
                accessToken: "jwt-plaintext"
            }
        });
        expect(response.statusCode).toBe(200);
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
            actorUserId: "user-001",
            actorApiTokenId: "token-001",
            action: "auth.login",
            objectType: "auth",
            objectId: "login",
            result: "success"
        }));
        expect(JSON.stringify(recordAudit.mock.calls[0]?.[0])).not.toContain("ChangeMe123!");
        expect(JSON.stringify(recordAudit.mock.calls[0]?.[0])).not.toContain("api-token-plaintext");
        expect(JSON.stringify(recordAudit.mock.calls[0]?.[0])).not.toContain("jwt-plaintext");
    });
    it("失败请求也记录 failure 结果", async () => {
        const recordAudit = vi.fn(async () => undefined);
        const server = Fastify();
        const auditHooks = createAuditHooks({ recordAudit });
        server.get("/fails", {
            preHandler: [auditHooks.audit({ action: "schema.publish", objectType: "schema" })]
        }, async () => {
            const error = new Error("boom");
            throw error;
        });
        const response = await server.inject({
            method: "GET",
            url: "/fails"
        });
        expect(response.statusCode).toBe(500);
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: "schema.publish",
            objectType: "schema",
            result: "failure"
        }));
    });
});
//# sourceMappingURL=audit.middleware.test.js.map
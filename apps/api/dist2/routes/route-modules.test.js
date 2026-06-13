import { describe, expect, it } from "vitest";
describe("route modules", () => {
    it("每个 API 分组都有独立路由注册模块", async () => {
        await expect(import("./auth.routes")).resolves.toHaveProperty("registerAuthRoutes");
        await expect(import("./schemas.routes")).resolves.toHaveProperty("registerSchemaRoutes");
        await expect(import("./files.routes")).resolves.toHaveProperty("registerFileRoutes");
        await expect(import("./jobs.routes")).resolves.toHaveProperty("registerJobRoutes");
        await expect(import("./results.routes")).resolves.toHaveProperty("registerResultRoutes");
        await expect(import("./feedback.routes")).resolves.toHaveProperty("registerFeedbackRoutes");
        await expect(import("./providers.routes")).resolves.toHaveProperty("registerProviderRoutes");
        await expect(import("./writeback.routes")).resolves.toHaveProperty("registerWritebackRoutes");
        await expect(import("./evaluation.routes")).resolves.toHaveProperty("registerEvaluationRoutes");
        await expect(import("./audit.routes")).resolves.toHaveProperty("registerAuditRoutes");
    });
});
//# sourceMappingURL=route-modules.test.js.map
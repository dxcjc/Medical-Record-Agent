import { describe, expect, it, vi } from "vitest";

import { PERMISSIONS, createPermissionGuard } from "./permissions";

describe("permissions", () => {
  it("为 schema publish 和 writeback 提供显式权限常量", () => {
    expect(PERMISSIONS.schemaPublish).toBe("schema:publish");
    expect(PERMISSIONS.writebackExecute).toBe("writeback:execute");
  });

  it("权限守卫调用 auth service 检查指定权限", () => {
    const authService = {
      requirePermission: vi.fn()
    };
    const guard = createPermissionGuard(authService);
    const context = {
      actorUserId: "user-001",
      authType: "jwt" as const,
      permissions: ["schema:publish"],
      roles: ["admin"]
    };

    guard.requireSchemaPublish(context);
    guard.requireWritebackExecute(context);

    expect(authService.requirePermission).toHaveBeenNthCalledWith(1, context, "schema:publish");
    expect(authService.requirePermission).toHaveBeenNthCalledWith(2, context, "writeback:execute");
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  chooseSessionInvalidationReadinessExitCode,
  formatSessionInvalidationReadinessSummary,
  runSessionInvalidationReadiness
} from "./session-invalidation-readiness";

describe("session invalidation readiness script", () => {
  it("passes local adapter contract checks while keeping real multi-instance production blocked", async () => {
    const summary = await runSessionInvalidationReadiness({
      now: () => new Date("2026-06-09T09:00:00.000Z")
    });

    expect(summary.localReadiness).toBe("passed");
    expect(summary.externalIntegration).toBe("blocked");
    expect(summary.finalProduct).toBe("blocked");
    expect(summary.checks).toEqual([
      {
        id: "database-adapter-contract",
        status: "passed",
        detail: "database adapter stores tokenHash only and respects expiresAt."
      },
      {
        id: "redis-adapter-contract",
        status: "passed",
        detail: "redis adapter stores tokenHash only with PX TTL."
      },
      {
        id: "production-factory-diagnostics",
        status: "passed",
        detail: "repository-backed store remains SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN until real two-instance smoke passes."
      }
    ]);
    expect(summary.blocked.requiredChecks).toEqual([
      "two-instance-session-invalidation-smoke",
      "token-hash-ttl-verification",
      "raw-token-not-persisted-check",
      "login-rotation-cross-instance-smoke"
    ]);
    expect(chooseSessionInvalidationReadinessExitCode(summary)).toBe(2);
    expect(formatSessionInvalidationReadinessSummary(summary)).toContain("localReadiness=passed");
    expect(formatSessionInvalidationReadinessSummary(summary)).toContain("externalIntegration=blocked");
    expect(formatSessionInvalidationReadinessSummary(summary)).toContain("finalProduct=blocked");
    expect(formatSessionInvalidationReadinessSummary(summary)).toContain("raw-token-not-persisted-check");
    expect(formatSessionInvalidationReadinessSummary(summary)).toContain("login-rotation-cross-instance-smoke");
  });

  it("fails local readiness when an adapter leaks a raw token in local contract diagnostics", async () => {
    const summary = await runSessionInvalidationReadiness({
      now: () => new Date("2026-06-09T09:00:00.000Z"),
      createRedisClient: (rawToken) => ({
        set: vi.fn(async (key: string, value: string) => {
          if (key.length > 0 && value.length > 0) {
            return "OK" as const;
          }
          return "OK" as const;
        }),
        get: vi.fn(async () => rawToken)
      })
    });

    expect(summary.localReadiness).toBe("failed");
    expect(summary.checks.find((check) => check.id === "redis-adapter-contract")).toEqual({
      id: "redis-adapter-contract",
      status: "failed",
      detail: "redis adapter contract leaked raw token or failed TTL lookup."
    });
    expect(chooseSessionInvalidationReadinessExitCode(summary)).toBe(1);
  });
});

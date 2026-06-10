import { describe, expect, it, vi } from "vitest";

import { hashSessionToken } from "./auth.service";
import {
  createDatabaseSessionInvalidationRepository,
  createRedisSessionInvalidationRepository
} from "./session-invalidation.repository";

describe("session invalidation repository adapters", () => {
  it("database adapter skeleton writes only token hash with TTL fields and exposes blocked readiness diagnostics", async () => {
    const rawToken = "raw.jwt.cookie-value-that-must-never-be-persisted";
    const tokenHash = hashSessionToken(rawToken);
    const rows = new Map<string, { tokenHash: string; invalidatedAt: Date; expiresAt: Date }>();
    const delegate = {
      upsert: vi.fn(async (input) => {
        rows.set(input.where.tokenHash, input.create);
        return input.create;
      }),
      findFirst: vi.fn(async (input) => {
        const row = rows.get(input.where.tokenHash);
        return row && row.expiresAt > input.where.expiresAt.gt ? row : null;
      })
    };
    const repository = createDatabaseSessionInvalidationRepository({ delegate });
    const invalidatedAt = new Date("2026-06-09T09:00:00.000Z");
    const expiresAt = new Date("2026-06-09T10:00:00.000Z");

    await repository.upsertInvalidatedSession({ tokenHash, invalidatedAt, expiresAt });

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: { tokenHash },
      create: { tokenHash, invalidatedAt, expiresAt },
      update: { invalidatedAt, expiresAt }
    });
    expect(JSON.stringify([...rows.values()])).not.toContain(rawToken);
    await expect(
      repository.findInvalidatedSession({ tokenHash, now: new Date("2026-06-09T09:30:00.000Z") })
    ).resolves.toEqual({ tokenHash, invalidatedAt, expiresAt });
    await expect(
      repository.findInvalidatedSession({ tokenHash, now: new Date("2026-06-09T10:00:01.000Z") })
    ).resolves.toBeNull();
    expect(repository.describe()).toEqual({
      provider: "database",
      storage: "session_invalidations",
      productionReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
      redaction: {
        rawTokenPersisted: false,
        tokenHashOnly: true
      },
      capabilities: {
        centralized: true,
        durable: true,
        ttl: true
      },
      readiness: {
        nextAction:
          "运行至少两个 API 实例共享 database session invalidation store 的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      }
    });
  });

  it("redis adapter skeleton stores token hashes with PX TTL and never sends raw JWT/cookie values to Redis", async () => {
    const rawToken = "raw.jwt.cookie-value-that-must-never-enter-redis";
    const tokenHash = hashSessionToken(rawToken);
    const redisRows = new Map<string, string>();
    const redisClient = {
      set: vi.fn(async (key: string, value: string, options?: { px?: number }) => {
        redisRows.set(key, JSON.stringify({ value, options }));
        return "OK" as const;
      }),
      get: vi.fn(async (key: string) => {
        const row = redisRows.get(key);
        if (!row) {
          return null;
        }

        const parsed = JSON.parse(row) as { value?: unknown };
        return typeof parsed.value === "string" ? parsed.value : null;
      })
    };
    const repository = createRedisSessionInvalidationRepository({
      client: redisClient,
      keyPrefix: "mra:test:session-invalidated:"
    });
    const invalidatedAt = new Date("2026-06-09T09:00:00.000Z");
    const expiresAt = new Date("2026-06-09T09:05:00.000Z");

    await repository.upsertInvalidatedSession({ tokenHash, invalidatedAt, expiresAt });

    expect(redisClient.set).toHaveBeenCalledWith(`mra:test:session-invalidated:${tokenHash}`, tokenHash, {
      px: 300000
    });
    expect(JSON.stringify([...redisRows.entries()])).not.toContain(rawToken);
    await expect(
      repository.findInvalidatedSession({ tokenHash, now: new Date("2026-06-09T09:01:00.000Z") })
    ).resolves.toEqual({ tokenHash });
    expect(repository.describe()).toEqual({
      provider: "redis",
      storage: "redis:mra:test:session-invalidated:",
      productionReady: false,
      blockedReason: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
      redaction: {
        rawTokenPersisted: false,
        tokenHashOnly: true
      },
      capabilities: {
        centralized: true,
        durable: true,
        ttl: true
      },
      readiness: {
        nextAction: "运行至少两个 API 实例共享 Redis session invalidation store 的登出/轮换失效 smoke。",
        requiredChecks: [
          "two-instance-session-invalidation-smoke",
          "token-hash-ttl-verification",
          "raw-token-not-persisted-check",
          "login-rotation-cross-instance-smoke"
        ]
      }
    });
  });
});

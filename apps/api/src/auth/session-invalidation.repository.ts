import type {
  SessionInvalidationRepository,
  SessionInvalidationStoreBlockedReason,
  SessionInvalidationStoreProvider
} from "./auth.service";

export interface SessionInvalidationRepositoryDescription {
  provider: SessionInvalidationStoreProvider;
  storage: string;
  productionReady: false;
  blockedReason: Extract<SessionInvalidationStoreBlockedReason, "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN">;
  redaction: {
    rawTokenPersisted: false;
    tokenHashOnly: true;
  };
  capabilities: {
    centralized: true;
    durable: true;
    ttl: true;
  };
  readiness: {
    nextAction: string;
    requiredChecks: string[];
  };
}

export interface SessionInvalidationRepositoryAdapter extends SessionInvalidationRepository {
  describe(): SessionInvalidationRepositoryDescription;
}

export interface DatabaseSessionInvalidationDelegate {
  upsert(input: {
    where: { tokenHash: string };
    create: { tokenHash: string; invalidatedAt: Date; expiresAt: Date };
    update: { invalidatedAt: Date; expiresAt: Date };
  }): Promise<unknown>;
  findFirst(input: { where: { tokenHash: string; expiresAt: { gt: Date } } }): Promise<unknown | null>;
}

export interface RedisSessionInvalidationClient {
  set(key: string, value: string, options: { px: number }): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

const REQUIRED_CHECKS = [
  "two-instance-session-invalidation-smoke",
  "token-hash-ttl-verification",
  "raw-token-not-persisted-check",
  "login-rotation-cross-instance-smoke"
];

function createDescription(provider: SessionInvalidationStoreProvider, storage: string): SessionInvalidationRepositoryDescription {
  return {
    provider,
    storage,
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
        provider === "database"
          ? "运行至少两个 API 实例共享 database session invalidation store 的登出/轮换失效 smoke。"
          : "运行至少两个 API 实例共享 Redis session invalidation store 的登出/轮换失效 smoke。",
      requiredChecks: REQUIRED_CHECKS
    }
  };
}

function positiveTtlMs(input: { invalidatedAt: Date; expiresAt: Date }) {
  return Math.max(1, input.expiresAt.getTime() - input.invalidatedAt.getTime());
}

export function createDatabaseSessionInvalidationRepository(options: {
  delegate: DatabaseSessionInvalidationDelegate;
  storageName?: string;
}): SessionInvalidationRepositoryAdapter {
  const storage = options.storageName ?? "session_invalidations";

  return {
    async upsertInvalidatedSession(input) {
      await options.delegate.upsert({
        where: { tokenHash: input.tokenHash },
        create: {
          tokenHash: input.tokenHash,
          invalidatedAt: input.invalidatedAt,
          expiresAt: input.expiresAt
        },
        update: {
          invalidatedAt: input.invalidatedAt,
          expiresAt: input.expiresAt
        }
      });
    },
    async findInvalidatedSession(input) {
      return options.delegate.findFirst({
        where: {
          tokenHash: input.tokenHash,
          expiresAt: {
            gt: input.now
          }
        }
      });
    },
    describe() {
      return createDescription("database", storage);
    }
  };
}

export function createRedisSessionInvalidationRepository(options: {
  client: RedisSessionInvalidationClient;
  keyPrefix?: string;
}): SessionInvalidationRepositoryAdapter {
  const keyPrefix = options.keyPrefix ?? "mra:session-invalidated:";

  function key(tokenHash: string) {
    return `${keyPrefix}${tokenHash}`;
  }

  return {
    async upsertInvalidatedSession(input) {
      await options.client.set(key(input.tokenHash), input.tokenHash, {
        px: positiveTtlMs(input)
      });
    },
    async findInvalidatedSession(input) {
      const value = await options.client.get(key(input.tokenHash));
      return value === input.tokenHash ? { tokenHash: input.tokenHash } : null;
    },
    describe() {
      return createDescription("redis", `redis:${keyPrefix}`);
    }
  };
}

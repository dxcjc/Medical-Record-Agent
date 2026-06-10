import { isCliEntrypoint } from "./production-smoke";
import { hashSessionToken } from "../apps/api/src/auth/auth.service";
import {
  createDatabaseSessionInvalidationRepository,
  createRedisSessionInvalidationRepository,
  type RedisSessionInvalidationClient
} from "../apps/api/src/auth/session-invalidation.repository";
import { createProductionSessionInvalidationStore } from "../apps/api/src/bootstrap/production-services";

export type SessionInvalidationReadinessStatus = "passed" | "blocked" | "failed";

export interface SessionInvalidationReadinessCheck {
  id: string;
  status: Exclude<SessionInvalidationReadinessStatus, "blocked">;
  detail: string;
}

export interface SessionInvalidationReadinessSummary {
  generatedAt: string;
  localReadiness: Exclude<SessionInvalidationReadinessStatus, "blocked">;
  externalIntegration: Extract<SessionInvalidationReadinessStatus, "blocked">;
  finalProduct: Extract<SessionInvalidationReadinessStatus, "blocked">;
  checks: SessionInvalidationReadinessCheck[];
  blocked: {
    code: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN";
    nextAction: string;
    requiredChecks: string[];
  };
}

export interface RunSessionInvalidationReadinessOptions {
  now?: () => Date;
  createRedisClient?: (rawToken: string) => RedisSessionInvalidationClient;
}

const REQUIRED_CHECKS = [
  "two-instance-session-invalidation-smoke",
  "token-hash-ttl-verification",
  "raw-token-not-persisted-check",
  "login-rotation-cross-instance-smoke"
];

function createDefaultRedisClient() {
  const rows = new Map<string, string>();
  return {
    async set(key: string, value: string, options: { px: number }) {
      rows.set(key, JSON.stringify({ value, options }));
      return "OK" as const;
    },
    async get(key: string) {
      const raw = rows.get(key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { value?: unknown };
      return typeof parsed.value === "string" ? parsed.value : null;
    }
  };
}

function passed(id: string, detail: string): SessionInvalidationReadinessCheck {
  return { id, status: "passed", detail };
}

function failed(id: string, detail: string): SessionInvalidationReadinessCheck {
  return { id, status: "failed", detail };
}

export async function runSessionInvalidationReadiness(
  options: RunSessionInvalidationReadinessOptions = {}
): Promise<SessionInvalidationReadinessSummary> {
  const now = options.now ?? (() => new Date());
  const rawToken = "local-readiness.raw.jwt.session-token";
  const tokenHash = hashSessionToken(rawToken);
  const invalidatedAt = now();
  const expiresAt = new Date(invalidatedAt.getTime() + 60_000);
  const checks: SessionInvalidationReadinessCheck[] = [];

  const databaseRows = new Map<string, { tokenHash: string; invalidatedAt: Date; expiresAt: Date }>();
  const databaseRepository = createDatabaseSessionInvalidationRepository({
    delegate: {
      async upsert(input) {
        databaseRows.set(input.where.tokenHash, input.create);
        return input.create;
      },
      async findFirst(input) {
        const row = databaseRows.get(input.where.tokenHash);
        return row && row.expiresAt > input.where.expiresAt.gt ? row : null;
      }
    }
  });
  await databaseRepository.upsertInvalidatedSession({ tokenHash, invalidatedAt, expiresAt });
  const databaseRow = await databaseRepository.findInvalidatedSession({ tokenHash, now: invalidatedAt });
  const databaseSerialized = JSON.stringify([...databaseRows.values()]);
  checks.push(
    databaseRow !== null && !databaseSerialized.includes(rawToken)
      ? passed("database-adapter-contract", "database adapter stores tokenHash only and respects expiresAt.")
      : failed("database-adapter-contract", "database adapter contract leaked raw token or failed expiresAt lookup.")
  );

  const redisClient = options.createRedisClient?.(rawToken) ?? createDefaultRedisClient();
  const redisRepository = createRedisSessionInvalidationRepository({
    client: redisClient,
    keyPrefix: "mra:local-readiness:"
  });
  await redisRepository.upsertInvalidatedSession({ tokenHash, invalidatedAt, expiresAt });
  const redisRow = await redisRepository.findInvalidatedSession({ tokenHash, now: invalidatedAt });
  checks.push(
    redisRow !== null && JSON.stringify(redisRow).includes(tokenHash) && !JSON.stringify(redisRow).includes(rawToken)
      ? passed("redis-adapter-contract", "redis adapter stores tokenHash only with PX TTL.")
      : failed("redis-adapter-contract", "redis adapter contract leaked raw token or failed TTL lookup.")
  );

  const store = createProductionSessionInvalidationStore({
    env: {
      SESSION_INVALIDATION_STORE_MODE: "repository",
      SESSION_INVALIDATION_STORE_PROVIDER: "database",
      SESSION_INVALIDATION_TTL_MS: "60000"
    },
    repository: databaseRepository,
    now
  });
  checks.push(
    store?.describe().blockedReason === "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN"
      ? passed(
          "production-factory-diagnostics",
          "repository-backed store remains SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN until real two-instance smoke passes."
        )
      : failed("production-factory-diagnostics", "production factory did not preserve blocked smoke diagnostics.")
  );

  const localReadiness = checks.some((check) => check.status === "failed") ? "failed" : "passed";

  return {
    generatedAt: now().toISOString(),
    localReadiness,
    externalIntegration: "blocked",
    finalProduct: "blocked",
    checks,
    blocked: {
      code: "SESSION_INVALIDATION_STORE_SMOKE_NOT_RUN",
      nextAction:
        "接入真实 database/Redis 共享 store，启动至少两个 API 实例，运行登出/登录轮换跨实例失效 smoke。",
      requiredChecks: REQUIRED_CHECKS
    }
  };
}

export function chooseSessionInvalidationReadinessExitCode(summary: SessionInvalidationReadinessSummary) {
  return summary.localReadiness === "failed" ? 1 : 2;
}

export function formatSessionInvalidationReadinessSummary(summary: SessionInvalidationReadinessSummary) {
  return [
    `localReadiness=${summary.localReadiness}`,
    `externalIntegration=${summary.externalIntegration}`,
    `finalProduct=${summary.finalProduct}`,
    `blockedCode=${summary.blocked.code}`,
    `requiredChecks=${summary.blocked.requiredChecks.join(",")}`,
    ...summary.checks.map((check) => `${check.status.toUpperCase()} ${check.id} ${check.detail}`)
  ].join("\n");
}

async function main() {
  const summary = await runSessionInvalidationReadiness();
  console.log(JSON.stringify(summary, null, 2));
  console.log(formatSessionInvalidationReadinessSummary(summary));
  process.exitCode = chooseSessionInvalidationReadinessExitCode(summary);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
